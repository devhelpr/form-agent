import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Load the system prompt from system-prompt.md
 */
function loadSystemPrompt(): string {
  try {
    const systemPromptPath = join(process.cwd(), "system-prompt.md");
    return readFileSync(systemPromptPath, "utf-8");
  } catch (error) {
    // Fallback to embedded prompt if file not found
    return getDefaultSystemPrompt();
  }
}

/**
 * Default system prompt (fallback if file not found)
 */
function getDefaultSystemPrompt(): string {
  return `You are an expert in generating UI and form schemas.
Your task is to generate a valid JSON file based on the user's prompt, following the UI/Form schema.

CRITICAL: You MUST always respond with valid JSON that conforms to the form schema. Do not include any text before or after the JSON. Your response must be parseable JSON.

The output must be valid JSON that conforms to the UI schema located at src/schema/form-schema.json.
Include all required fields according to the schema.
Generate practical and usable UI components based on the user's prompt.
Create a logical structure with meaningful pages, components, and data sources.

For each page:
- Assign a unique ID and descriptive title
- Specify a meaningful route (URL path)
- Choose an appropriate layout (grid, flex, vertical, or horizontal)
- Include relevant components based on the page's purpose
- Set isEndPage to true for final pages where form submission should occur
- Define branches for conditional navigation based on user input
- Specify nextPage for linear navigation flow

For components:
- Each component must have a unique ID and appropriate type
- Use descriptive, simple field IDs that can be used directly in template variables
- Use the correct component type based on functionality
- Include appropriate validation rules
- Add helpful helperText when it improves user experience

IMPORTANT: The top-level object should have an "app" property containing the title and pages array.
DO NOT embed the schema itself in the response! BUT it should be valid JSON which follows the schema.`;
}

export const formGenerationPrompt = `
${loadSystemPrompt()}

CRITICAL INSTRUCTIONS:
1. Generate ONLY valid JSON - no markdown, no code blocks, no explanations
2. The JSON must conform exactly to the schema at src/schema/form-schema.json
3. Use simple, descriptive field IDs (e.g., "fullName", "email", not "user_full_name")
4. Include validation rules with helpful error messages
5. Add helperText to fields when it improves UX
6. Use template variables {{fieldId}} for dynamic content in text components
7. For calculated fields, use expressions in props.expression
8. For multi-language support, structure translations properly (but don't add language selectors to forms)

Your response must be valid JSON that can be parsed and validated against the schema.
`;

export const formGenerationSchema = {
  type: "object",
  description: "Form JSON conforming to form-schema.json",
  properties: {
    app: {
      type: "object",
      required: ["title", "pages"],
    },
    translations: {
      type: "object",
    },
    defaultLanguage: {
      type: "string",
    },
    supportedLanguages: {
      type: "array",
    },
    languageDetails: {
      type: "array",
    },
  },
  required: ["app"],
};

