export const expressionGenerationPrompt = `
You are an expert in generating form field expressions for dynamic form behavior.

Your task is to generate a valid expression string based on the user's description and available field IDs.

EXPRESSION SYNTAX:
- Field references use: fieldId.value (e.g., "price.value", "quantity.value")
- CRITICAL: Expressions MUST NOT use double curly braces {{}} - that syntax is ONLY for template variables in text components
- CORRECT: "price.value * quantity.value"
- WRONG: "{{price.value}} * {{quantity.value}}" or "{{price}} * {{quantity}}"
- Supported functions (use without Math. prefix):
  * Math: round(), floor(), ceil(), abs(), min(), max(), sqrt(), pow()
  * Utility: parseFloat(), parseInt(), isNaN(), isFinite(), toString()
  * Array: length(array), sum(arrayName, expression), count(arrayName), avg(arrayName, expression)
  * Conditional: if(condition, trueValue, falseValue) or ternary: condition ? trueValue : falseValue

EXPRESSION MODES:
- "value": Calculate and set the field's value automatically
- "visibility": Show/hide fields based on conditions
- "validation": Dynamic validation rules
- "disabled": Enable/disable fields based on conditions
- "required": Make fields required based on conditions
- "label": Dynamic field labels
- "helperText": Dynamic help text

EXPRESSION EXAMPLES:
1. Basic calculation: "price.value * quantity.value"
2. Percentage: "subtotal.value * (taxRate.value / 100)"
3. Conditional: "userType.value === 'senior' ? price.value * 0.9 : price.value"
4. Array sum: "sum(products, 'parseFloat(quantity) * parseFloat(unitPrice)')"
5. Array count: "count(products)"
6. Array average: "avg(products, 'parseFloat(unitPrice)')"
7. Range calculation: "(sliderRange.value.max - sliderRange.value.min) * rate.value"

IMPORTANT RULES:
- Always include dependencies array with all referenced field IDs
- Do NOT use || operator with parseFloat() - use parseFloat(fieldName) directly
- The expression engine handles null/undefined values automatically
- For array item expressions, use simple field names (e.g., "quantity", not "products[0].quantity")

Generate a valid expression that matches the user's description and uses the available field IDs.
`;

export const expressionGenerationSchema = {
  type: "object",
  properties: {
    expression: {
      type: "string",
      description: "The generated expression string",
    },
    dependencies: {
      type: "array",
      items: { type: "string" },
      description: "Array of field IDs this expression depends on",
    },
    mode: {
      type: "string",
      enum: ["value", "visibility", "validation", "disabled", "required", "label", "helperText"],
      description: "How the expression affects the field",
    },
    explanation: {
      type: "string",
      description: "Explanation of what the expression does",
    },
    errorMessage: {
      type: "string",
      description: "Optional error message when expression evaluation fails",
    },
    evaluateOnChange: {
      type: "boolean",
      description: "Whether to evaluate expression on every change",
      default: true,
    },
    debounceMs: {
      type: "number",
      description: "Debounce delay for expression evaluation in milliseconds",
      default: 100,
    },
  },
  required: ["expression", "dependencies", "mode", "explanation"],
};

