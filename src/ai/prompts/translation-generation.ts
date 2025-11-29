export const translationGenerationPrompt = `
You are an expert in generating translations for multi-language forms.

Your task is to generate translation objects for the provided form JSON, translating all user-facing text into the target languages.

TRANSLATION STRUCTURE:
The translation object should match the structure of the form, with translations for:
- app.title: Translated app title
- pages[].title: Translated page titles
- pages[].components[].label: Translated component labels
- pages[].components[].props.placeholder: Translated placeholder text
- pages[].components[].props.helperText: Translated helper text
- pages[].components[].props.options[].label: Translated option labels
- pages[].components[].validation.errorMessages: Translated validation error messages
- thankYouPage.title, thankYouPage.message: Translated thank you page content
- ui.*: All UI text translations (buttons, labels, messages)
- errorMessages.*: Default error message translations

IMPORTANT RULES:
1. Preserve all structure and field IDs - only translate text content
2. Keep option values unchanged (only translate labels)
3. Maintain placeholders in error messages (e.g., {minLength}, {max}, {fieldLabel})
4. Generate complete translations - don't leave any text untranslated
5. Use natural, contextually appropriate translations
6. For UI text, maintain the same tone and formality level
7. Include languageDetails array with code, name, and nativeName for each language

LANGUAGE DETAILS FORMAT:
{
  "code": "es",
  "name": "Spanish",
  "nativeName": "Español"
}

Generate complete translation objects for all target languages.
`;

export const translationGenerationSchema = {
  type: "object",
  properties: {
    translations: {
      type: "object",
      description: "Object with language codes as keys and translation entries as values",
      additionalProperties: {
        type: "object",
      },
    },
    languageDetails: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          name: { type: "string" },
          nativeName: { type: "string" },
        },
        required: ["code", "name", "nativeName"],
      },
      description: "Detailed information about each supported language",
    },
  },
  required: ["translations", "languageDetails"],
};

