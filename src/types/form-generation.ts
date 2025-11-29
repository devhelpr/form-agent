/**
 * Type definitions for form JSON generation tools
 */

export interface JsonSchemaValidationError {
  path: string;
  message: string;
  schemaPath: string;
  instancePath?: string;
  params?: Record<string, unknown>;
}

export interface JsonSchemaValidationResult {
  valid: boolean;
  errors: JsonSchemaValidationError[];
  warnings?: string[];
}

export interface ExpressionGenerationRequest {
  description: string; // e.g., "Calculate total as price * quantity"
  fieldIds: string[]; // Available field IDs in the form
  context?: {
    fieldType?: string;
    mode?: "value" | "visibility" | "validation" | "disabled" | "required" | "label" | "helperText";
    currentFieldId?: string;
  };
}

export interface ExpressionGenerationResult {
  expression: string;
  dependencies: string[];
  mode: string;
  explanation: string;
  errorMessage?: string;
  evaluateOnChange?: boolean;
  debounceMs?: number;
}

export interface TranslationGenerationRequest {
  formJson: object; // The form JSON to translate
  targetLanguages: string[]; // e.g., ["es", "fr", "de"]
  sourceLanguage?: string; // Default: "en"
}

export interface TranslationEntry {
  app?: {
    title?: string;
  };
  pages?: Array<{
    id: string;
    title?: string;
    components?: Array<{
      id: string;
      label?: string;
      props?: {
        placeholder?: string;
        helperText?: string;
        options?: Array<{
          label: string;
          value: unknown;
        }>;
      };
      validation?: {
        errorMessages?: Record<string, string>;
      };
    }>;
  }>;
  thankYouPage?: {
    title?: string;
    message?: string;
    customActions?: Array<{
      label: string;
    }>;
  };
  ui?: {
    stepIndicator?: string;
    nextButton?: string;
    previousButton?: string;
    submitButton?: string;
    confirmSubmitButton?: string;
    reviewConfirmButton?: string;
    submissionsTitle?: string;
    noSubmissionsText?: string;
    thankYouTitle?: string;
    thankYouMessage?: string;
    restartButton?: string;
    multiPageInfo?: string;
    invalidFormData?: string;
    noPagesDefined?: string;
    invalidPageIndex?: string;
    noContentInSection?: string;
    addItemButton?: string;
    removeItemButton?: string;
    addAnotherButton?: string;
    requiredIndicator?: string;
    requiredText?: string;
    loadingText?: string;
    submittingText?: string;
    requiredFieldAriaLabel?: string;
    optionalFieldAriaLabel?: string;
    errorAriaLabel?: string;
    successAriaLabel?: string;
  };
  errorMessages?: {
    required?: string;
    minLength?: string;
    maxLength?: string;
    pattern?: string;
    minItems?: string;
    maxItems?: string;
    minDate?: string;
    maxDate?: string;
    min?: string;
    max?: string;
    invalidFormat?: string;
    invalidEmail?: string;
    invalidNumber?: string;
    invalidDate?: string;
    generic?: string;
  };
}

export interface TranslationGenerationResult {
  translations: {
    [languageCode: string]: TranslationEntry;
  };
  languageDetails: Array<{
    code: string;
    name: string;
    nativeName: string;
  }>;
}

export interface FormGenerationRequest {
  userPrompt: string;
  options?: {
    includeTranslations?: boolean;
    languages?: string[];
    validateSchema?: boolean;
  };
}

export interface FormGenerationMetadata {
  pageCount: number;
  componentCount: number;
  hasExpressions: boolean;
  hasTranslations: boolean;
  hasBranches: boolean;
  hasValidation: boolean;
}

export interface FormGenerationResult {
  formJson: object;
  validationResult?: JsonSchemaValidationResult;
  translations?: TranslationGenerationResult;
  metadata: FormGenerationMetadata;
}

