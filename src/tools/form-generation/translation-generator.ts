import { z } from "zod";
import {
  TranslationGenerationRequest,
  TranslationGenerationResult,
} from "../../types/form-generation.js";
import {
  makeAICallWithSchema,
  ApiCallOptions,
} from "../../ai/api-calls.js";
import { LogConfig } from "../../utils/logging.js";
import {
  translationGenerationPrompt,
  translationGenerationSchema,
} from "../../ai/prompts/translation-generation.js";
import {
  isFatalSchemaError,
  getFatalSchemaErrorMessage,
} from "../../utils/error-detection.js";

const TranslationResultSchema = z.object(translationGenerationSchema);

export async function generateTranslations(
  request: TranslationGenerationRequest,
  logConfig: LogConfig = { enabled: true },
  options: ApiCallOptions = {}
): Promise<TranslationGenerationResult> {
  const sourceLanguage = request.sourceLanguage || "en";
  const targetLanguages = request.targetLanguages;

  const prompt = `
${translationGenerationPrompt}

SOURCE FORM JSON:
${JSON.stringify(request.formJson, null, 2)}

TARGET LANGUAGES: ${targetLanguages.join(", ")}
SOURCE LANGUAGE: ${sourceLanguage}

Generate complete translations for all target languages. Ensure all user-facing text is translated.
`;

  const messages = [
    {
      role: "system" as const,
      content: prompt,
    },
    {
      role: "user" as const,
      content: `Generate translations for: ${targetLanguages.join(", ")}`,
    },
  ];

  try {
    const response = await makeAICallWithSchema(
      messages,
      TranslationResultSchema,
      logConfig,
      options
    );

    if (!response.choices?.[0]?.message?.content) {
      throw new Error("No content received from AI translation generation");
    }

    const result = JSON.parse(response.choices[0].message.content);

    return {
      translations: result.translations || {},
      languageDetails: result.languageDetails || [],
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
      `Failed to generate translations: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

