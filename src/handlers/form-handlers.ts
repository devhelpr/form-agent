import { Decision } from "../types/decision.js";
import { MessageArray } from "../core/agent.js";
import { LogConfig, log } from "../utils/logging.js";
import { AIProvider } from "../ai/ai-client.js";
import { JsonSchemaValidator } from "../tools/validation/json-schema-validator.js";
import {
  generateExpression,
  generateTranslations,
  generateFormJson,
} from "../tools/form-generation/index.js";
import {
  ExpressionGenerationRequest,
  TranslationGenerationRequest,
  FormGenerationRequest,
} from "../types/form-generation.js";

export async function handleValidateFormJson(
  decision: Decision,
  transcript: MessageArray,
  logConfig: LogConfig
): Promise<void> {
  if (decision.action !== "validate_form_json" || !decision.tool_input) {
    throw new Error("Invalid decision for validate_form_json handler");
  }

  const { formJson, schemaPath } = decision.tool_input;

  log(logConfig, "tool", "Validating form JSON against schema", {
    schemaPath: schemaPath || "default",
    jsonLength: formJson?.length || 0,
  });

  try {
    const validator = new JsonSchemaValidator(schemaPath);
    await validator.loadSchema();

    // Parse JSON string if needed
    let jsonData: object;
    if (typeof formJson === "string") {
      jsonData = JSON.parse(formJson);
    } else {
      jsonData = formJson as object;
    }

    const result = await validator.validate(jsonData);

    if (result.valid) {
      transcript.push({
        role: "assistant",
        content: `✅ Form JSON is valid against the schema.`,
      });
    } else {
      const errorMessages = result.errors
        .map((e) => `${e.path}: ${e.message}`)
        .join("\n");
      transcript.push({
        role: "assistant",
        content: `❌ Form JSON validation failed:\n${errorMessages}\n\nErrors:\n${JSON.stringify(result.errors, null, 2)}`,
      });
    }

    log(logConfig, "tool", "Validation complete", {
      valid: result.valid,
      errorCount: result.errors.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    transcript.push({
      role: "assistant",
      content: `❌ Validation error: ${errorMessage}`,
    });
    log(logConfig, "error", "Validation failed", { error: errorMessage });
  }
}

export async function handleGenerateExpression(
  decision: Decision,
  transcript: MessageArray,
  logConfig: LogConfig,
  aiProvider?: AIProvider
): Promise<void> {
  if (
    decision.action !== "generate_expression" ||
    !decision.tool_input?.expressionRequest
  ) {
    throw new Error("Invalid decision for generate_expression handler");
  }

  const request = decision.tool_input.expressionRequest as ExpressionGenerationRequest;

  log(logConfig, "tool", "Generating expression", {
    description: request.description,
    fieldIds: request.fieldIds,
  });

  try {
    const result = await generateExpression(
      request,
      logConfig,
      { provider: aiProvider }
    );

    transcript.push({
      role: "assistant",
      content: `✅ Generated expression:\n\`\`\`\nExpression: ${result.expression}\nMode: ${result.mode}\nDependencies: ${result.dependencies.join(", ")}\nExplanation: ${result.explanation}\n\`\`\`\n\nFull result:\n${JSON.stringify(result, null, 2)}`,
    });

    log(logConfig, "tool", "Expression generated", {
      expression: result.expression,
      dependencies: result.dependencies,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    transcript.push({
      role: "assistant",
      content: `❌ Expression generation failed: ${errorMessage}`,
    });
    log(logConfig, "error", "Expression generation failed", {
      error: errorMessage,
    });
  }
}

export async function handleGenerateTranslations(
  decision: Decision,
  transcript: MessageArray,
  logConfig: LogConfig,
  aiProvider?: AIProvider
): Promise<void> {
  if (
    decision.action !== "generate_translations" ||
    !decision.tool_input?.translationRequest
  ) {
    throw new Error("Invalid decision for generate_translations handler");
  }

  const request = decision.tool_input.translationRequest as TranslationGenerationRequest;

  log(logConfig, "tool", "Generating translations", {
    targetLanguages: request.targetLanguages,
    sourceLanguage: request.sourceLanguage || "en",
  });

  try {
    const result = await generateTranslations(
      request,
      logConfig,
      { provider: aiProvider }
    );

    transcript.push({
      role: "assistant",
      content: `✅ Generated translations for ${request.targetLanguages.length} language(s):\n\nLanguages: ${result.languageDetails.map((l) => `${l.code} (${l.nativeName})`).join(", ")}\n\nTranslation structure:\n${JSON.stringify(Object.keys(result.translations), null, 2)}\n\nFull result:\n${JSON.stringify(result, null, 2)}`,
    });

    log(logConfig, "tool", "Translations generated", {
      languageCount: result.languageDetails.length,
      translationKeys: Object.keys(result.translations),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    transcript.push({
      role: "assistant",
      content: `❌ Translation generation failed: ${errorMessage}`,
    });
    log(logConfig, "error", "Translation generation failed", {
      error: errorMessage,
    });
  }
}

// Store generated form JSON for CLI access
let lastGeneratedFormJson: object | null = null;

export function getLastGeneratedFormJson(): object | null {
  return lastGeneratedFormJson;
}

export async function handleGenerateFormJson(
  decision: Decision,
  transcript: MessageArray,
  logConfig: LogConfig,
  aiProvider?: AIProvider
): Promise<void> {
  if (
    decision.action !== "generate_form_json" ||
    !decision.tool_input?.formGenerationRequest
  ) {
    throw new Error("Invalid decision for generate_form_json handler");
  }

  const request = decision.tool_input.formGenerationRequest as FormGenerationRequest;

  log(logConfig, "tool", "Generating form JSON", {
    userPrompt: request.userPrompt.substring(0, 100),
    includeTranslations: request.options?.includeTranslations,
    languages: request.options?.languages,
  });

  try {
    const result = await generateFormJson(
      request,
      logConfig,
      { provider: aiProvider }
    );

    // Store the generated form JSON for CLI access
    lastGeneratedFormJson = result.formJson;

    // Build response message
    let responseContent = `✅ Generated form JSON:\n\n`;
    responseContent += `Metadata:\n`;
    responseContent += `- Pages: ${result.metadata.pageCount}\n`;
    responseContent += `- Components: ${result.metadata.componentCount}\n`;
    responseContent += `- Has Expressions: ${result.metadata.hasExpressions}\n`;
    responseContent += `- Has Translations: ${result.metadata.hasTranslations}\n`;
    responseContent += `- Has Branches: ${result.metadata.hasBranches}\n`;
    responseContent += `- Has Validation: ${result.metadata.hasValidation}\n\n`;

    if (result.validationResult) {
      if (result.validationResult.valid) {
        responseContent += `✅ Schema validation: PASSED\n\n`;
      } else {
        responseContent += `❌ Schema validation: FAILED\n`;
        responseContent += `Errors:\n${result.validationResult.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n")}\n\n`;
      }
    }

    if (result.translations) {
      responseContent += `✅ Translations generated for ${result.translations.languageDetails.length} language(s)\n\n`;
    }

    responseContent += `Form JSON:\n\`\`\`json\n${JSON.stringify(result.formJson, null, 2)}\n\`\`\``;

    transcript.push({
      role: "assistant",
      content: responseContent,
    });

    log(logConfig, "tool", "Form JSON generated", {
      pageCount: result.metadata.pageCount,
      componentCount: result.metadata.componentCount,
      valid: result.validationResult?.valid,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    transcript.push({
      role: "assistant",
      content: `❌ Form generation failed: ${errorMessage}`,
    });
    log(logConfig, "error", "Form generation failed", {
      error: errorMessage,
    });
  }
}

