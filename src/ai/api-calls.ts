import { LogConfig, log } from "../utils/logging";
import { generateObject, generateText, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AIClient, AIProvider } from "./ai-client";
import { planningPrompt } from "./prompts/planning";
import { projectAnalysisPrompt } from "./prompts/project-analysis";
import { PlanStep, ExecutionPlan } from "../tools/planning";
import { ProjectAnalysis } from "../tools/project-analysis";

// Global token tracking
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalCalls = 0;

export function getTokenStats() {
  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCalls,
  };
}

export function resetTokenStats() {
  totalInputTokens = 0;
  totalOutputTokens = 0;
  totalCalls = 0;
}

// Helper function to extract meaningful schema information for logging
function getSchemaInfo(schema: z.ZodSchema): string {
  try {
    // Access the internal definition with proper typing
    const def = (schema as any)._def;

    // Try to get the schema name or description
    if (def && def.description) {
      return def.description;
    }

    // For Zod object schemas, try to extract field information
    if (def && def.type === "object" && def.shape) {
      const shape = def.shape; // It's a getter, not a function
      const fields = Object.keys(shape);
      return `ZodObject with fields: ${fields.join(", ")}`;
    }

    // For other Zod types, show the type
    if (def && def.type) {
      return `Zod${def.type.charAt(0).toUpperCase() + def.type.slice(1)}`;
    }

    // Fallback to a generic description
    return "Zod schema (structured output)";
  } catch (error) {
    return "Zod schema (unable to inspect)";
  }
}

export function displayTokenSummary(
  tokenStats: ReturnType<typeof getTokenStats>
) {
  console.log("\n📊 TOKEN USAGE SUMMARY:");
  console.log(`   Total API Calls: ${tokenStats.totalCalls}`);
  console.log(
    `   Input Tokens: ${tokenStats.totalInputTokens.toLocaleString()}`
  );
  console.log(
    `   Output Tokens: ${tokenStats.totalOutputTokens.toLocaleString()}`
  );
  console.log(`   Total Tokens: ${tokenStats.totalTokens.toLocaleString()}`);
  console.log(
    `   Average per Call: ${
      tokenStats.totalCalls > 0
        ? Math.round(tokenStats.totalTokens / tokenStats.totalCalls)
        : 0
    } tokens\n`
  );
}

/** ---------- API Helper Functions ---------- */
export interface ApiCallOptions {
  maxRetries?: number;
  timeoutMs?: number;
  truncateTranscript?: boolean;
  provider?: AIProvider;
  model?: string;
  span?: any; // OpenTelemetry span for tracing
}

export async function makeAICall(
  messages: Array<{ role: string; content: string }>,
  schema: z.ZodSchema,
  logConfig: LogConfig,
  options: ApiCallOptions = {}
) {
  const {
    maxRetries = 3,
    timeoutMs = 120000,
    truncateTranscript = true,
    provider,
    model,
  } = options;

  // Truncate transcript if it's too long to avoid context length issues
  let processedMessages = messages;
  if (truncateTranscript && messages.length > 20) {
    // Keep system message, user goal, and last 15 messages
    processedMessages = [
      messages[0], // system
      messages[1], // user goal
      ...messages.slice(-15), // last 15 messages
    ];
    log(
      logConfig,
      "step",
      `Truncated transcript from ${messages.length} to ${processedMessages.length} messages`
    );
  }

  // Create AI client
  const aiClient = provider
    ? new AIClient({ provider, model })
    : AIClient.fromEnvironment(provider, model);

  // Convert messages to AI SDK format (outside try block for use in catch block)
  const systemMessage = processedMessages.find((m) => m.role === "system");
  const userMessages = processedMessages.filter((m) => m.role !== "system");

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Suppress step logging - UI will show progress
      log(
        logConfig,
        "step",
        `Making ${aiClient
          .getProvider()
          .toUpperCase()} API call (attempt ${attempt}/${maxRetries})...`
      );

      // Log detailed schema information for debugging
      log(
        logConfig,
        "debug",
        `Schema details for ${aiClient.getProvider().toUpperCase()} call`,
        {
          schemaType: getSchemaInfo(schema),
          schemaConstructor: schema.constructor.name,
          hasDescription: !!(schema as any)._def?.description,
          isZodObject: (schema as any)._def?.typeName === "ZodObject",
        }
      );

      // Log prompt and context information
      log(
        logConfig,
        "prompt-context",
        `Prompt and context for ${aiClient
          .getProvider()
          .toUpperCase()} API call`,
        {
          systemPrompt: systemMessage?.content || "No system prompt",
          userMessages: userMessages.map((msg, index) => ({
            index: index + 1,
            role: msg.role,
            content: msg.content,
            contentLength: msg.content.length,
            preview:
              msg.content.substring(0, 200) +
              (msg.content.length > 200 ? "..." : ""),
          })),
          totalMessages: processedMessages.length,
          schema: getSchemaInfo(schema),
          model: aiClient.getModel(),
          provider: aiClient.getProvider(),
        }
      );

      // Log the actual parameters being sent to generateObject
      const generateObjectParams: any = {
        model: aiClient.getModel(),
        schema,
        messages: userMessages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        system: systemMessage?.content,
        maxOutputTokens: 4000,
        temperature: aiClient.getTemperature(),
      };

      // Set provider-specific options
      if (aiClient.getProvider() === "openai") {
        // Set reasoning to minimal for OpenAI provider (GPT-5 option in AI SDK v5)
        generateObjectParams.providerOptions = {
          openai: {
            reasoningEffort: "minimal",
          },
        };
      } else if (aiClient.getProvider() === "ollama") {
        // Explicitly convert Zod schema to JSON schema for Ollama's format parameter
        // According to https://ollama.com/blog/structured-outputs, Ollama supports
        // structured outputs via the format parameter with JSON schema
        try {
          // Type assertion needed because zodToJsonSchema expects a more specific Zod type
          // Using 'as any' to work around type incompatibility between Zod versions
          const jsonSchema = zodToJsonSchema(schema as any, {
            target: "jsonSchema7",
            $refStrategy: "none", // Avoid $ref for better Ollama compatibility
          });
          
          generateObjectParams.providerOptions = {
            ollama: {
              format: jsonSchema,
            },
          };

          log(
            logConfig,
            "debug",
            "Converted Zod schema to JSON schema for Ollama format parameter",
            {
              schemaType: getSchemaInfo(schema),
              jsonSchemaKeys: Object.keys(jsonSchema as object),
            }
          );
        } catch (conversionError) {
          log(
            logConfig,
            "debug",
            "Failed to convert Zod schema to JSON schema for Ollama, will rely on AI SDK conversion",
            {
              error: String(conversionError),
            }
          );
          // Continue without explicit format - AI SDK might handle it
        }
      }

      // Add detailed information to span if provided
      if (options.span) {
        const span = options.span;
        span.setAttribute("ai.call.provider", aiClient.getProvider());
        span.setAttribute("ai.call.model", aiClient.getModel());
        span.setAttribute("ai.call.model_name", aiClient.getModelName());
        span.setAttribute("ai.call.temperature", aiClient.getTemperature());
        span.setAttribute("ai.call.max_output_tokens", 4000);
        span.setAttribute("ai.call.message_count", generateObjectParams.messages.length);
        span.setAttribute("ai.call.has_system_prompt", !!generateObjectParams.system);
        if (generateObjectParams.system) {
          span.setAttribute("ai.call.system_prompt_length", generateObjectParams.system.length);
          span.setAttribute("ai.call.system_prompt", generateObjectParams.system.substring(0, 1000));
        }
        // Add reasoning effort for OpenAI
        if (generateObjectParams.providerOptions?.openai?.reasoningEffort) {
          span.setAttribute("ai.call.reasoning_effort", generateObjectParams.providerOptions.openai.reasoningEffort);
        }
        // Add Ollama format information
        if (generateObjectParams.providerOptions?.ollama?.format) {
          const format = generateObjectParams.providerOptions.ollama.format as any;
          span.setAttribute("ai.call.ollama.format.type", format?.type || "unknown");
          span.setAttribute("ai.call.ollama.format.has_properties", !!format?.properties);
          if (format?.properties) {
            span.setAttribute("ai.call.ollama.format.property_count", Object.keys(format.properties).length);
          }
        }
        // Add user messages summary
        const userMessagesSummary = userMessages.map((msg, idx) => ({
          index: idx,
          role: msg.role,
          length: msg.content.length,
          preview: msg.content.substring(0, 200),
        }));
        span.setAttribute("ai.call.user_messages_summary", JSON.stringify(userMessagesSummary));
        span.setAttribute("ai.call.schema_info", getSchemaInfo(schema));
        span.setAttribute("ai.call.attempt", attempt);
        span.setAttribute("ai.call.max_retries", maxRetries);
      }

      log(
        logConfig,
        "debug",
        `generateObject parameters for ${aiClient.getProvider().toUpperCase()}`,
        {
          modelName: aiClient.getModelName(),
          messageCount: generateObjectParams.messages.length,
          hasSystemPrompt: !!generateObjectParams.system,
          systemPromptLength: generateObjectParams.system?.length || 0,
          maxOutputTokens: generateObjectParams.maxOutputTokens,
          temperature: generateObjectParams.temperature,
          schemaInfo: getSchemaInfo(schema),
          reasoningEffort: generateObjectParams.providerOptions?.openai?.reasoningEffort,
          hasOllamaFormat: !!generateObjectParams.providerOptions?.ollama?.format,
          ollamaFormatType: generateObjectParams.providerOptions?.ollama?.format
            ? (generateObjectParams.providerOptions.ollama.format as any)?.type || "unknown"
            : undefined,
        }
      );

      const apiCallPromise = generateObject(generateObjectParams);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `${aiClient
                  .getProvider()
                  .toUpperCase()} API call timeout after ${
                  timeoutMs / 1000
                } seconds`
              )
            ),
          timeoutMs
        )
      );

      const response = await Promise.race([apiCallPromise, timeoutPromise]);

      // Extract token usage from response
      const usage = response.usage;
      if (usage) {
        const inputTokens = usage.inputTokens || 0;
        const outputTokens = usage.outputTokens || 0;
        const totalTokens = usage.totalTokens || 0;

        // Add token usage to span if provided
        if (options.span) {
          const span = options.span;
          span.setAttribute("ai.call.tokens.input", inputTokens);
          span.setAttribute("ai.call.tokens.output", outputTokens);
          span.setAttribute("ai.call.tokens.total", totalTokens);
          span.setAttribute("ai.call.success", true);
        }

        // Update global counters
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        totalCalls += 1;

        // Log token usage for this call
        log(
          logConfig,
          "step",
          `${aiClient
            .getProvider()
            .toUpperCase()} API call completed successfully`,
          {
            tokens: {
              input: inputTokens,
              output: outputTokens,
              total: totalTokens,
            },
            cumulative: {
              input: totalInputTokens,
              output: totalOutputTokens,
              total: totalInputTokens + totalOutputTokens,
              calls: totalCalls,
            },
          }
        );
      } else {
        log(
          logConfig,
          "step",
          `${aiClient
            .getProvider()
            .toUpperCase()} API call completed successfully (no token usage data)`
        );
      }

      // Add response information to span if provided
      if (options.span && response.object) {
        const span = options.span;
        const responseContent = JSON.stringify(response.object);
        span.setAttribute("ai.call.response.length", responseContent.length);
        span.setAttribute("ai.call.response.preview", responseContent.substring(0, 1000));
        span.setAttribute("ai.call.has_response", true);
      }

      // Return response in OpenAI-compatible format for backward compatibility
      return {
        choices: [
          {
            message: {
              content: JSON.stringify(response.object),
              role: "assistant" as const,
            },
          },
        ],
        usage: usage
          ? {
              prompt_tokens: usage.inputTokens,
              completion_tokens: usage.outputTokens,
              total_tokens: usage.totalTokens,
            }
          : undefined,
      };
    } catch (error) {
      const errorMsg = String(error);

      // Add error information to span if provided
      if (options.span) {
        const span = options.span;
        span.setAttribute("ai.call.success", false);
        span.setAttribute("ai.call.error.message", errorMsg);
        span.setAttribute("ai.call.error.attempt", attempt);
        if (error instanceof Error) {
          span.recordException?.(error);
        }
      }

      // Enhanced error logging for schema validation failures
      if (NoObjectGeneratedError.isInstance(error)) {
        log(
          logConfig,
          "step",
          `${aiClient
            .getProvider()
            .toUpperCase()} API call attempt ${attempt} failed - Schema validation error, trying fallback`,
          {
            error: errorMsg,
            cause: error.cause,
            generatedText: error.text
              ? error.text.substring(0, 500) +
                (error.text.length > 500 ? "..." : "")
              : "No text generated",
            response: error.response,
            usage: error.usage,
          }
        );

        // Try fallback with generateText if we have generated text
        if (error.text && attempt === maxRetries) {
          try {
            log(
              logConfig,
              "step",
              "Attempting fallback parsing of generated text"
            );

            // Try to repair and parse the generated text
            const repairedText = repairMalformedJSON(error.text);
            let parsedText = JSON.parse(repairedText);
            
            // Try to repair plan steps if this looks like a planning schema
            // Check if it has a steps array (indicating it might be a planning schema)
            if (parsedText && Array.isArray(parsedText.steps)) {
              parsedText = repairPlanSteps(parsedText);
            }

            // Validate against the schema manually
            const validatedObject = schema.parse(parsedText);

            log(logConfig, "step", "Fallback parsing successful");

            // Return in the same format as generateObject
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(validatedObject),
                    role: "assistant" as const,
                  },
                },
              ],
              usage: error.usage
                ? {
                    prompt_tokens: error.usage.inputTokens,
                    completion_tokens: error.usage.outputTokens,
                    total_tokens: error.usage.totalTokens,
                  }
                : undefined,
            };
          } catch (fallbackError) {
            log(logConfig, "step", "Fallback parsing also failed", {
              fallbackError: String(fallbackError),
            });
          }
        }
      } else {
        // Check if this is an Ollama-specific schema error
        const isOllamaSchemaError =
          aiClient.getProvider() === "ollama" &&
          (errorMsg.toLowerCase().includes("invalid json schema") ||
            errorMsg.toLowerCase().includes("invalid format") ||
            errorMsg.toLowerCase().includes("ollamaerror"));

        if (isOllamaSchemaError && attempt === maxRetries) {
          // For Ollama, try using generateText as fallback if structured output fails
          // Note: We attempt structured output first with explicit format parameter,
          // but some complex schemas may still fail
          log(
            logConfig,
            "step",
            `Ollama schema error detected - falling back to generateText. Structured output with explicit format parameter failed, possibly due to schema complexity or model limitations.`
          );
          
          try {
            // Fallback to generateText for Ollama
            const generateTextParams: any = {
              model: aiClient.getModel(),
              messages: userMessages.map((msg) => ({
                role: msg.role as "user" | "assistant",
                content: msg.content,
              })),
              system: systemMessage?.content,
              maxTokens: 4000,
              temperature: aiClient.getTemperature(),
            };

            // Add very explicit instruction to return JSON in the system prompt
            // Ollama models sometimes need very clear instructions
            const jsonInstruction = `\n\nCRITICAL: Your response must be ONLY valid JSON. 
- Do NOT include any text before or after the JSON
- Do NOT use markdown code blocks
- Do NOT include explanations, comments, or any other text
- Start your response with { and end with }
- Return ONLY the JSON object that matches the requested schema
- Example of correct response: {"key": "value"}
- Example of WRONG response: "Here is the JSON: {...}" or \`\`\`json {...}\`\`\``;

            const enhancedSystemPrompt = systemMessage?.content 
              ? `${systemMessage.content}${jsonInstruction}`
              : `You are a JSON generator.${jsonInstruction}`;

            generateTextParams.system = enhancedSystemPrompt;

            log(
              logConfig,
              "step",
              "Attempting Ollama fallback with generateText"
            );

            const textResponse = await generateText(generateTextParams);
            const textContent = textResponse.text.trim();

            // Log the raw response for debugging
            log(
              logConfig,
              "debug",
              "Ollama generateText raw response",
              {
                responseLength: textContent.length,
                responsePreview: textContent.substring(0, 500),
                responseEnd: textContent.length > 500 ? textContent.substring(textContent.length - 200) : undefined,
              }
            );

            // Try multiple strategies to extract JSON from the response
            let jsonText = extractJsonFromText(textContent);
            
            if (!jsonText) {
              // If extraction failed, log the full response for debugging
              log(
                logConfig,
                "error",
                "Failed to extract JSON from Ollama response",
                {
                  fullResponse: textContent,
                  responseLength: textContent.length,
                  firstChars: textContent.substring(0, 200),
                  lastChars: textContent.length > 200 ? textContent.substring(textContent.length - 200) : undefined,
                }
              );
              throw new Error(
                `Failed to extract JSON from Ollama response. Response (${textContent.length} chars) starts with: "${textContent.substring(0, 150)}..." and ends with: "...${textContent.substring(Math.max(0, textContent.length - 150))}"`
              );
            }

            // Try to repair malformed JSON
            let parsedObject: any;
            try {
              const repairedText = repairMalformedJSON(jsonText);
              parsedObject = JSON.parse(repairedText);
            } catch (parseError) {
              log(
                logConfig,
                "error",
                "Failed to parse extracted JSON from Ollama response",
                {
                  extractedJson: jsonText.substring(0, 500),
                  extractedJsonLength: jsonText.length,
                  parseError: String(parseError),
                  parseErrorDetails: parseError instanceof SyntaxError 
                    ? {
                        message: parseError.message,
                        // Try to extract position info if available
                        position: (parseError as any).position,
                      }
                    : undefined,
                }
              );
              throw new Error(
                `Failed to parse JSON from Ollama response: ${parseError instanceof Error ? parseError.message : String(parseError)}. Extracted JSON (${jsonText.length} chars) starts with: "${jsonText.substring(0, 200)}"`
              );
            }

            // Log the parsed object before validation for debugging
            log(
              logConfig,
              "debug",
              "Parsed object from Ollama response (before validation)",
              {
                parsedObjectKeys: Object.keys(parsedObject || {}),
                parsedObjectPreview: JSON.stringify(parsedObject).substring(0, 1000),
                hasAction: "action" in (parsedObject || {}),
                actionValue: parsedObject?.action,
                parsedObjectType: typeof parsedObject,
                isArray: Array.isArray(parsedObject),
              }
            );

            // Try to repair plan steps if this looks like a planning schema
            if (parsedObject && Array.isArray(parsedObject.steps)) {
              parsedObject = repairPlanSteps(parsedObject);
            }

            // Try to repair common issues with decision schemas
            if (parsedObject && typeof parsedObject === "object" && !Array.isArray(parsedObject)) {
              parsedObject = repairDecisionObject(parsedObject);
            }

            // Validate against the schema
            let validatedObject: any;
            try {
              validatedObject = schema.parse(parsedObject);
            } catch (validationError) {
              // Log detailed validation error information
              // Check if it's a ZodError by checking for the issues property
              const zodError = validationError as any;
              if (zodError && Array.isArray(zodError.issues)) {
                log(
                  logConfig,
                  "error",
                  "Schema validation failed for Ollama response",
                  {
                    parsedObject: JSON.stringify(parsedObject, null, 2).substring(0, 2000),
                    validationErrors: zodError.issues.map((err: any) => ({
                      path: (err.path || []).join("."),
                      message: err.message,
                      code: err.code,
                      received: err.received,
                      expected: err.expected,
                    })),
                    errorCount: zodError.issues.length,
                  }
                );
              } else {
                log(
                  logConfig,
                  "error",
                  "Schema validation failed for Ollama response (non-ZodError)",
                  {
                    parsedObject: JSON.stringify(parsedObject, null, 2).substring(0, 2000),
                    validationError: String(validationError),
                    validationErrorType: validationError instanceof Error ? validationError.constructor.name : typeof validationError,
                  }
                );
              }
              throw validationError;
            }

            log(logConfig, "step", "Ollama fallback to generateText successful");

            // Extract token usage if available
            const usage = textResponse.usage;
            if (usage) {
              totalInputTokens += usage.inputTokens || 0;
              totalOutputTokens += usage.outputTokens || 0;
              totalCalls += 1;
            }

            // Return in the same format as generateObject
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(validatedObject),
                    role: "assistant" as const,
                  },
                },
              ],
              usage: usage
                ? {
                    prompt_tokens: usage.inputTokens || 0,
                    completion_tokens: usage.outputTokens || 0,
                    total_tokens: usage.totalTokens || 0,
                  }
                : undefined,
            };
          } catch (fallbackError) {
            const errorDetails: any = {
              fallbackError: String(fallbackError),
              errorType: fallbackError instanceof Error ? fallbackError.constructor.name : typeof fallbackError,
            };

            // If we have the text response, include it in error details
            if (fallbackError instanceof Error && fallbackError.message.includes("Response")) {
              errorDetails.hasResponseInfo = true;
            } else {
              // Try to get response info from the error if available
              try {
                const textResponse = (fallbackError as any).response?.text || (fallbackError as any).text;
                if (textResponse) {
                  errorDetails.responsePreview = String(textResponse).substring(0, 500);
                  errorDetails.responseLength = String(textResponse).length;
                }
              } catch {
                // Ignore errors accessing error properties
              }
            }

            log(
              logConfig,
              "step",
              "Ollama fallback to generateText also failed",
              errorDetails
            );
            // Continue to throw the original error
          }
        } else {
          log(
            logConfig,
            "step",
            `${aiClient
              .getProvider()
              .toUpperCase()} API call attempt ${attempt} failed`,
            {
              error: errorMsg,
            }
          );
        }
      }

      if (attempt === maxRetries) {
        throw error; // Re-throw on final attempt
      }

      // Wait before retry (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      log(logConfig, "step", `Retrying in ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw new Error("All retry attempts failed");
}

// Helper function to extract JSON from text that may contain non-JSON content
// Tries multiple strategies to find valid JSON
function extractJsonFromText(text: string): string | null {
  // Strategy 1: Try to find JSON in markdown code blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    const candidate = jsonBlockMatch[1].trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Not valid JSON, continue to next strategy
    }
  }

  // Strategy 2: Try to find JSON object by looking for opening brace
  // Find the first { and try to match it with a closing }
  let braceCount = 0;
  let startIndex = -1;
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (startIndex === -1) {
        startIndex = i;
      }
      braceCount++;
    } else if (text[i] === '}') {
      braceCount--;
      if (braceCount === 0 && startIndex !== -1) {
        const candidate = text.substring(startIndex, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // Not valid JSON, continue searching
          startIndex = -1;
        }
      }
    }
  }

  // Strategy 3: Try to find JSON array
  let bracketCount = 0;
  let arrayStartIndex = -1;
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[') {
      if (arrayStartIndex === -1) {
        arrayStartIndex = i;
      }
      bracketCount++;
    } else if (text[i] === ']') {
      bracketCount--;
      if (bracketCount === 0 && arrayStartIndex !== -1) {
        const candidate = text.substring(arrayStartIndex, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // Not valid JSON, continue searching
          arrayStartIndex = -1;
        }
      }
    }
  }

  // Strategy 4: Try regex to find JSON-like structures
  const jsonLikeMatch = text.match(/\{[\s\S]{10,}\}/);
  if (jsonLikeMatch) {
    const candidate = jsonLikeMatch[0];
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Not valid JSON
    }
  }

  // Strategy 5: Try to parse the entire text (might be pure JSON)
  try {
    JSON.parse(text);
    return text;
  } catch {
    // Not valid JSON
  }

  return null;
}

// Helper function to repair decision objects that may have common issues
function repairDecisionObject(data: any): any {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const repaired = { ...data };

  // If action is missing or invalid, try to infer it from the structure
  if (!repaired.action || typeof repaired.action !== "string") {
    // Try to infer action from the presence of specific fields
    if (repaired.tool_input?.paths || repaired.paths) {
      repaired.action = "read_files";
    } else if (repaired.tool_input?.query || repaired.query) {
      repaired.action = "search_repo";
    } else if (repaired.tool_input?.formGenerationRequest || repaired.formGenerationRequest) {
      repaired.action = "generate_form_json";
    } else if (repaired.tool_input?.expressionRequest || repaired.expressionRequest) {
      repaired.action = "generate_expression";
    } else if (repaired.tool_input?.translationRequest || repaired.translationRequest) {
      repaired.action = "generate_translations";
    } else if (repaired.tool_input?.formJson || repaired.formJson) {
      repaired.action = "validate_form_json";
    } else if (repaired.tool_input?.scan_directories || repaired.scan_directories) {
      repaired.action = "analyze_project";
    } else if (repaired.tool_input?.plan_steps || repaired.plan_steps) {
      repaired.action = "create_plan";
    } else if (repaired.tool_input?.command || repaired.command) {
      repaired.action = "run_cmd";
    } else if (repaired.tool_input?.patch || repaired.patch) {
      repaired.action = "write_patch";
    } else if (repaired.tool_input?.evaluation || repaired.evaluation) {
      repaired.action = "evaluate_work";
    } else {
      // Default to final_answer if we can't infer
      repaired.action = "final_answer";
    }
  }

  // Normalize action value (handle case variations)
  if (repaired.action && typeof repaired.action === "string") {
    const validActions = [
      "read_files",
      "search_repo",
      "write_patch",
      "run_cmd",
      "evaluate_work",
      "create_plan",
      "analyze_project",
      "validate_form_json",
      "generate_expression",
      "generate_translations",
      "generate_form_json",
      "final_answer",
    ];
    
    const normalizedAction = repaired.action.toLowerCase().trim();
    if (validActions.includes(normalizedAction)) {
      repaired.action = normalizedAction;
    }
  }

  // Ensure tool_input is an object if it exists
  if (repaired.tool_input && typeof repaired.tool_input !== "object") {
    repaired.tool_input = {};
  }

  // Move top-level fields that should be in tool_input into tool_input
  const toolInputFields = [
    "paths", "query", "patch", "command", "evaluation",
    "formGenerationRequest", "expressionRequest", "translationRequest",
    "formJson", "schemaPath", "scan_directories", "plan_steps", "project_context"
  ];
  
  if (!repaired.tool_input) {
    repaired.tool_input = {};
  }
  
  for (const field of toolInputFields) {
    if (repaired[field] !== undefined && repaired.tool_input[field] === undefined) {
      repaired.tool_input[field] = repaired[field];
      delete repaired[field];
    }
  }

  return repaired;
}

// Helper function to repair plan steps missing the required field
// This is a safety net in case the AI SDK doesn't fully enforce the schema
function repairPlanSteps(data: any): any {
  if (data && Array.isArray(data.steps)) {
    const repairedSteps = data.steps.map((step: any, index: number) => {
      // Ensure dependencies is always an array
      const dependencies = Array.isArray(step.dependencies) ? step.dependencies : [];
      
      // If required field is missing, try to extract it from the step text
      if (step.required === undefined || step.required === null) {
        const stepText = step.step || "";
        // Check if step text contains "Required:" or "Optional:" indicators
        const isRequired = /required/i.test(stepText) && !/optional/i.test(stepText);
        const isOptional = /optional/i.test(stepText);
        
        // Clean up the step text by removing prefixes like "S1 — Required:" or "Required:"
        const cleanedStep = stepText
          .replace(/^S\d+\s*[—–-]\s*(Required|Optional):\s*/i, "")
          .replace(/^(Required|Optional):\s*/i, "")
          .trim();
        
        return {
          step: cleanedStep || stepText,
          required: isRequired || !isOptional, // Default to required if unclear
          dependencies,
        };
      }
      
      // Clean up step text even if required field is present
      const stepText = step.step || "";
      const cleanedStep = stepText
        .replace(/^S\d+\s*[—–-]\s*(Required|Optional):\s*/i, "")
        .replace(/^(Required|Optional):\s*/i, "")
        .trim();
      
      return {
        step: cleanedStep || stepText,
        required: step.required,
        dependencies,
      };
    });
    
    return {
      ...data,
      steps: repairedSteps,
    };
  }
  return data;
}

// Helper function to repair malformed JSON responses
function repairMalformedJSON(text: string): string {
  try {
    // First, try to parse as-is
    const parsed = JSON.parse(text);

    // Check if tool_input is a string that contains XML-like content
    if (parsed.tool_input && typeof parsed.tool_input === "string") {
      const toolInputStr = parsed.tool_input;

      // Handle XML-like parameter syntax (both complete and incomplete tags)
      // Example: "\n<parameter name=\"files\">[\"App.tsx\"]</parameter>"
      // Example: "\n<parameter name=\"paths\">[\"App.tsx\", \"src/App.tsx\"]" (incomplete)
      const xmlParamMatch = toolInputStr.match(
        /\n<parameter\s+name="([^"]+)">([^<]+)(?:<\/parameter>)?/
      );
      if (xmlParamMatch) {
        const [, paramName, paramValue] = xmlParamMatch;
        try {
          const parsedValue = JSON.parse(paramValue);
          parsed.tool_input = { [paramName]: parsedValue };
        } catch {
          parsed.tool_input = { [paramName]: paramValue };
        }
        return JSON.stringify(parsed);
      }

      // Handle other XML-like patterns
      const xmlTagMatches = toolInputStr.match(/<([^>]+)>([^<]+)<\/[^>]+>/g);
      if (xmlTagMatches) {
        const toolInputObj: Record<string, any> = {};
        xmlTagMatches.forEach((match: string) => {
          const tagMatch = match.match(/<([^>]+)>([^<]+)<\/[^>]+>/);
          if (tagMatch) {
            const [, tagName, value] = tagMatch;
            try {
              toolInputObj[tagName] = JSON.parse(value);
            } catch {
              toolInputObj[tagName] = value;
            }
          }
        });
        parsed.tool_input = toolInputObj;
        return JSON.stringify(parsed);
      }
    }

    return text;
  } catch (error) {
    // If parsing fails, try to repair common issues

    // Handle XML-like parameter syntax in tool_input
    // Example: "tool_input": "\n<parameter name=\"files\">[\"App.tsx\"]"
    let repaired = text;

    // Fix XML-like parameter syntax (both complete and incomplete tags)
    const xmlParamRegex =
      /"tool_input":\s*"\\n<parameter\s+name=\\"([^"]+)\\">([^<]+)(?:<\/parameter>)?"/g;
    repaired = repaired.replace(
      xmlParamRegex,
      (match, paramName, paramValue) => {
        try {
          // Try to parse the parameter value as JSON
          const parsedValue = JSON.parse(paramValue);
          return `"tool_input": ${JSON.stringify({
            [paramName]: parsedValue,
          })}`;
        } catch {
          // If parsing fails, treat as string
          return `"tool_input": ${JSON.stringify({ [paramName]: paramValue })}`;
        }
      }
    );

    // Fix other common XML-like patterns
    const xmlValueRegex = /"tool_input":\s*"\\n<([^>]+)>([^<]+)<\/[^>]+>"/g;
    repaired = repaired.replace(xmlValueRegex, (match, tagName, value) => {
      try {
        const parsedValue = JSON.parse(value);
        return `"tool_input": ${JSON.stringify(parsedValue)}`;
      } catch {
        return `"tool_input": ${JSON.stringify({ [tagName]: value })}`;
      }
    });

    // Fix escaped quotes in strings
    repaired = repaired.replace(/\\"/g, '"');

    // Fix common JSON syntax issues
    repaired = repaired.replace(/,(\s*[}\]])/g, "$1"); // Remove trailing commas
    repaired = repaired.replace(
      /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
      '$1"$2":'
    ); // Quote unquoted keys

    return repaired;
  }
}

// Generic AI call function with schema validation
export async function makeAICallWithSchema(
  messages: Array<{ role: string; content: string }>,
  schema: z.ZodSchema,
  logConfig: LogConfig,
  options: ApiCallOptions = {}
) {
  return makeAICall(messages, schema, logConfig, {
    ...options,
    provider: options.provider || "openai",
  });
}

// Planning API call function
export async function createPlanWithAI(
  userGoal: string,
  projectContext?: string,
  logConfig: LogConfig = { enabled: true, logSteps: true },
  options: ApiCallOptions = {}
): Promise<ExecutionPlan> {
  // Define strict schema with explicit required fields
  const planStepSchema = z
    .object({
      step: z
        .string()
        .min(1)
        .describe("Clear description of the step to be executed"),
      required: z
        .boolean()
        .describe("Whether this step is required to achieve the user's goal. Must be true or false."),
      dependencies: z
        .array(z.string())
        .optional()
        .describe("Array of step IDs that must be completed before this step"),
    })
    .strict(); // Prevent extra fields

  const planningSchema = z
    .object({
      steps: z
        .array(planStepSchema)
        .min(1)
        .describe("Array of plan steps in execution order"),
      projectContext: z
        .string()
        .optional()
        .describe("Summary of project context and technology stack"),
      userGoal: z
        .string()
        .min(1)
        .describe("The user's goal that this plan addresses"),
    })
    .strict(); // Prevent extra fields

  const messages = [
    {
      role: "system",
      content: planningPrompt,
    },
    {
      role: "user",
      content: `Create a structured execution plan for the following goal:

**User Goal:** ${userGoal}

${projectContext ? `**Project Context:** ${projectContext}` : ""}

Please analyze this goal and create a detailed, executable plan with clear steps, dependencies, and priorities. Focus on breaking down complex tasks into manageable, sequential steps.`,
    },
  ];

  log(logConfig, "planning", "Creating AI-generated execution plan", {
    userGoal,
    hasProjectContext: !!projectContext,
    provider: options.provider || "openai",
  });

  const response = await makeAICall(
    messages,
    planningSchema,
    logConfig,
    options
  );

  if (!response.choices?.[0]?.message?.content) {
    throw new Error("No content received from AI planning call");
  }

  const planData = JSON.parse(response.choices[0].message.content);

  // Repair steps that might be missing the required field
  const repairedPlanData = repairPlanSteps(planData);
  
  // Log if any repairs were made
  if (repairedPlanData !== planData) {
    log(logConfig, "planning", "Repaired plan steps with missing required fields", {
      stepCount: repairedPlanData.steps.length,
    });
  }

  // Convert to ExecutionPlan format
  const executionPlan: ExecutionPlan = {
    steps: repairedPlanData.steps,
    projectContext: repairedPlanData.projectContext || projectContext,
    createdAt: new Date(),
    userGoal: repairedPlanData.userGoal || userGoal,
  };

  log(logConfig, "planning", "AI-generated plan created successfully", {
    stepCount: executionPlan.steps.length,
    requiredSteps: executionPlan.steps.filter((s) => s.required).length,
    optionalSteps: executionPlan.steps.filter((s) => !s.required).length,
  });

  return executionPlan;
}

// Project Analysis API call function
export async function analyzeProjectWithAI(
  scanDirectories: string[],
  projectFiles: string[],
  logConfig: LogConfig = { enabled: true, logSteps: true },
  options: ApiCallOptions = {}
): Promise<ProjectAnalysis> {
  const projectAnalysisSchema = z.object({
    language: z.string().describe("Primary programming language detected"),
    projectType: z
      .enum(["node", "browser", "library", "unknown"])
      .describe("Type of project"),
    buildTools: z
      .array(z.string())
      .describe("Build tools and bundlers detected"),
    testFramework: z
      .string()
      .optional()
      .describe("Testing framework if detected"),
    packageManager: z.string().optional().describe("Package manager used"),
    hasTypeScript: z.boolean().describe("Whether TypeScript is used"),
    hasReact: z.boolean().describe("Whether React is used"),
    hasVue: z.boolean().describe("Whether Vue is used"),
    hasAngular: z.boolean().describe("Whether Angular is used"),
    mainFiles: z.array(z.string()).describe("Key source files found"),
    configFiles: z.array(z.string()).describe("Configuration files found"),
    dependencies: z
      .record(z.string(), z.string())
      .describe("Production dependencies"),
    devDependencies: z
      .record(z.string(), z.string())
      .describe("Development dependencies"),
    architecture: z
      .string()
      .optional()
      .describe("Architectural patterns detected"),
    recommendations: z
      .array(z.string())
      .optional()
      .describe("Recommendations for improvements"),
  });

  const messages = [
    {
      role: "system",
      content: projectAnalysisPrompt,
    },
    {
      role: "user",
      content: `Analyze the following project structure:

**Scan Directories:** ${scanDirectories.join(", ")}

**Project Files Found:** ${projectFiles.join(", ")}

Please provide a comprehensive analysis of this project's technology stack, structure, dependencies, and architecture. Focus on identifying key technologies, patterns, and providing actionable insights.`,
    },
  ];

  log(logConfig, "project-analysis", "Performing AI-powered project analysis", {
    scanDirectories,
    fileCount: projectFiles.length,
    provider: options.provider || "openai",
  });

  const response = await makeAICall(
    messages,
    projectAnalysisSchema,
    logConfig,
    options
  );

  if (!response.choices?.[0]?.message?.content) {
    throw new Error("No content received from AI project analysis call");
  }

  const analysisData = JSON.parse(response.choices[0].message.content);

  // Convert to ProjectAnalysis format
  const projectAnalysis: ProjectAnalysis = {
    language: analysisData.language,
    projectType: analysisData.projectType,
    buildTools: analysisData.buildTools,
    testFramework: analysisData.testFramework,
    packageManager: analysisData.packageManager,
    hasTypeScript: analysisData.hasTypeScript,
    hasReact: analysisData.hasReact,
    hasVue: analysisData.hasVue,
    hasAngular: analysisData.hasAngular,
    mainFiles: analysisData.mainFiles,
    configFiles: analysisData.configFiles,
    dependencies: analysisData.dependencies,
    devDependencies: analysisData.devDependencies,
  };

  log(logConfig, "project-analysis", "AI-powered project analysis completed", {
    language: projectAnalysis.language,
    projectType: projectAnalysis.projectType,
    buildToolsCount: projectAnalysis.buildTools.length,
    hasTypeScript: projectAnalysis.hasTypeScript,
    hasReact: projectAnalysis.hasReact,
  });

  return projectAnalysis;
}
