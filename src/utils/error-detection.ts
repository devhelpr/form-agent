/**
 * Error detection utilities for identifying fatal errors that should cause application exit
 */

/**
 * Check if an error is a schema-related API error that should cause the application to exit
 */
export function isFatalSchemaError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();
  const errorString = String(error).toLowerCase();

  // Check for schema-related errors
  const fatalErrorPatterns = [
    "invalid schema for response_format",
    "invalid schema",
    "invalid json schema",
    "schema must be a json schema",
    "type: \"none\"",
    "response_format",
    "ai_apicallerror",
    "ollamaerror",
    "invalid format",
  ];

  return fatalErrorPatterns.some(
    (pattern) =>
      errorMessage.includes(pattern) || errorString.includes(pattern)
  );
}

/**
 * Get a user-friendly error message for fatal schema errors
 */
export function getFatalSchemaErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return `Fatal schema error: ${String(error)}`;
  }

  return `Fatal schema error detected. This indicates a problem with the schema configuration.\n\nError: ${error.message}\n\nThe application will exit to prevent further issues.`;
}

