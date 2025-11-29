import { z } from "zod";
import {
  FormGenerationRequest,
  FormGenerationResult,
  FormGenerationMetadata,
} from "../../types/form-generation.js";
import {
  makeAICallWithSchema,
  ApiCallOptions,
} from "../../ai/api-calls.js";
import { LogConfig } from "../../utils/logging.js";
import { JsonSchemaValidator } from "../validation/json-schema-validator.js";
import { generateTranslations } from "./translation-generator.js";
import {
  formGenerationPrompt,
  formGenerationSchema,
} from "../../ai/prompts/form-generation.js";
import {
  isFatalSchemaError,
  getFatalSchemaErrorMessage,
} from "../../utils/error-detection.js";

// Create a flexible schema that matches the form structure
// Use a basic object schema to satisfy AI SDK requirements
const FormJsonSchema = z.object({
  app: z.object({
    title: z.string(),
    pages: z.array(z.any()),
  }).passthrough(),
}).passthrough(); // Allow additional properties

/**
 * Analyze form JSON to extract metadata
 */
function extractMetadata(formJson: any): FormGenerationMetadata {
  const pages = formJson?.app?.pages || [];
  let componentCount = 0;
  let hasExpressions = false;
  let hasBranches = false;
  let hasValidation = false;

  function countComponents(components: any[]): void {
    if (!Array.isArray(components)) return;

    components.forEach((component) => {
      componentCount++;
      if (component.props?.expression) {
        hasExpressions = true;
      }
      if (component.validation) {
        hasValidation = true;
      }
      if (component.children) {
        countComponents(component.children);
      }
      if (component.arrayItems) {
        component.arrayItems.forEach((item: any) => {
          if (item.components) {
            countComponents(item.components);
          }
        });
      }
    });
  }

  pages.forEach((page: any) => {
    if (page.components) {
      countComponents(page.components);
    }
    if (page.branches && page.branches.length > 0) {
      hasBranches = true;
    }
  });

  return {
    pageCount: pages.length,
    componentCount,
    hasExpressions,
    hasTranslations: !!formJson.translations,
    hasBranches,
    hasValidation,
  };
}

export async function generateFormJson(
  request: FormGenerationRequest,
  logConfig: LogConfig = { enabled: true },
  options: ApiCallOptions = {}
): Promise<FormGenerationResult> {
  const prompt = `
${formGenerationPrompt}

USER PROMPT: ${request.userPrompt}

${request.options?.includeTranslations ? "INCLUDE TRANSLATIONS: Yes" : ""}
${request.options?.languages ? `TARGET LANGUAGES: ${request.options.languages.join(", ")}` : ""}

Generate a complete form JSON that satisfies the user's requirements.
`;

  const messages = [
    {
      role: "system" as const,
      content: prompt,
    },
    {
      role: "user" as const,
      content: request.userPrompt,
    },
  ];

  try {
    // Generate form JSON using AI
    const response = await makeAICallWithSchema(
      messages,
      FormJsonSchema,
      logConfig,
      options
    );

    if (!response.choices?.[0]?.message?.content) {
      throw new Error("No content received from AI form generation");
    }

    // Parse the JSON response
    let formJson: any;
    try {
      const content = response.choices[0].message.content.trim();
      // Remove markdown code blocks if present
      const jsonContent = content.replace(/^```json\n?/g, "").replace(/^```\n?/g, "").replace(/\n?```$/g, "").trim();
      formJson = JSON.parse(jsonContent);
    } catch (parseError) {
      throw new Error(
        `Failed to parse generated JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    // Validate against JSON schema if requested
    let validationResult;
    if (request.options?.validateSchema !== false) {
      try {
        const validator = new JsonSchemaValidator();
        await validator.loadSchema();
        validationResult = await validator.validate(formJson);
      } catch (validationError) {
        // Log but don't fail - validation errors will be in the result
        logConfig.enabled && console.warn("Schema validation error:", validationError);
        validationResult = {
          valid: false,
          errors: [
            {
              path: "",
              message: `Validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`,
              schemaPath: "",
            },
          ],
        };
      }
    }

    // Generate translations if requested
    let translations;
    if (request.options?.includeTranslations && request.options?.languages) {
      try {
        translations = await generateTranslations(
          {
            formJson,
            targetLanguages: request.options.languages,
            sourceLanguage: "en",
          },
          logConfig,
          options
        );
      } catch (translationError) {
        // Log but don't fail
        logConfig.enabled && console.warn("Translation generation error:", translationError);
      }
    }

    // Extract metadata
    const metadata = extractMetadata(formJson);

    return {
      formJson,
      validationResult,
      translations,
      metadata,
    };
  } catch (error) {
    // Check if this is a fatal schema error
    if (isFatalSchemaError(error)) {
      console.error("\n❌ " + getFatalSchemaErrorMessage(error));
      console.error("\nThis is a fatal error that cannot be recovered from.");
      console.error("Please check your schema configuration and try again.\n");
      process.exit(1);
    }
    // Re-throw other errors
    throw new Error(
      `Failed to generate form JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

