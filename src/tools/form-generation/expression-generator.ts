import { z } from "zod";
import {
  ExpressionGenerationRequest,
  ExpressionGenerationResult,
} from "../../types/form-generation.js";
import {
  makeAICallWithSchema,
  ApiCallOptions,
} from "../../ai/api-calls.js";
import { LogConfig } from "../../utils/logging.js";
import { AIProvider } from "../../ai/ai-client.js";
import {
  expressionGenerationPrompt,
  expressionGenerationSchema,
} from "../../ai/prompts/expression-generation.js";
import {
  isFatalSchemaError,
  getFatalSchemaErrorMessage,
} from "../../utils/error-detection.js";

const ExpressionResultSchema = z.object(expressionGenerationSchema);

export async function generateExpression(
  request: ExpressionGenerationRequest,
  logConfig: LogConfig = { enabled: true },
  options: ApiCallOptions = {}
): Promise<ExpressionGenerationResult> {
  const prompt = `
${expressionGenerationPrompt}

USER REQUEST:
Description: ${request.description}
Available Field IDs: ${request.fieldIds.join(", ")}
${request.context ? `Context: ${JSON.stringify(request.context, null, 2)}` : ""}

Generate an expression that: ${request.description}
`;

  const messages = [
    {
      role: "system" as const,
      content: prompt,
    },
    {
      role: "user" as const,
      content: `Generate an expression for: ${request.description}`,
    },
  ];

  try {
    const response = await makeAICallWithSchema(
      messages,
      ExpressionResultSchema,
      logConfig,
      options
    );

    if (!response.choices?.[0]?.message?.content) {
      throw new Error("No content received from AI expression generation");
    }

    const result = JSON.parse(response.choices[0].message.content);

    return {
      expression: result.expression,
      dependencies: result.dependencies || [],
      mode: result.mode || "value",
      explanation: result.explanation || "",
      errorMessage: result.errorMessage,
      evaluateOnChange: result.evaluateOnChange ?? true,
      debounceMs: result.debounceMs ?? 100,
    };
  } catch (error) {
    // Check if this is a fatal schema error
    if (isFatalSchemaError(error)) {
      // Minimal error - details go to traces/logs
      const { log: clackLog } = await import("@clack/prompts");
      clackLog.error("Fatal schema error");
      process.exit(1);
    }
    // Re-throw other errors
    throw new Error(
      `Failed to generate expression: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

