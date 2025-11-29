import Ajv, { ValidateFunction, ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  JsonSchemaValidationResult,
  JsonSchemaValidationError,
} from "../../types/form-generation.js";

export class JsonSchemaValidator {
  private ajv: Ajv;
  private validateFunction: ValidateFunction | null = null;
  private schemaPath: string;

  constructor(schemaPath?: string) {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      validateSchema: true,
    });
    addFormats(this.ajv);
    this.schemaPath =
      schemaPath ||
      path.join(process.cwd(), "src", "schema", "form-schema.json");
  }

  /**
   * Load and compile the JSON schema
   */
  async loadSchema(): Promise<void> {
    try {
      const schemaContent = await fs.readFile(this.schemaPath, "utf-8");
      const schema = JSON.parse(schemaContent);
      this.validateFunction = this.ajv.compile(schema);
    } catch (error) {
      throw new Error(
        `Failed to load JSON schema from ${this.schemaPath}: ${error}`
      );
    }
  }

  /**
   * Validate a JSON object against the schema
   */
  async validate(jsonData: object | string): Promise<JsonSchemaValidationResult> {
    // Ensure schema is loaded
    if (!this.validateFunction) {
      await this.loadSchema();
    }

    if (!this.validateFunction) {
      throw new Error("Schema validation function not initialized");
    }

    // Parse JSON string if needed
    let data: object;
    if (typeof jsonData === "string") {
      try {
        data = JSON.parse(jsonData);
      } catch (error) {
        return {
          valid: false,
          errors: [
            {
              path: "",
              message: `Invalid JSON: ${error}`,
              schemaPath: "",
            },
          ],
        };
      }
    } else {
      data = jsonData;
    }

    // Validate
    const valid = this.validateFunction(data);

    // Convert Ajv errors to our format
    const errors: JsonSchemaValidationError[] =
      this.validateFunction.errors?.map((error: ErrorObject) => ({
        path: error.instancePath || error.params?.path || "",
        message: error.message || "Validation error",
        schemaPath: error.schemaPath || "",
        instancePath: error.instancePath,
        params: error.params,
      })) || [];

    return {
      valid,
      errors,
      warnings: valid && errors.length > 0 ? ["Validation passed with warnings"] : undefined,
    };
  }

  /**
   * Validate and return formatted error messages
   */
  async validateWithMessages(
    jsonData: object | string
  ): Promise<{ valid: boolean; messages: string[] }> {
    const result = await this.validate(jsonData);

    if (result.valid) {
      return { valid: true, messages: [] };
    }

    const messages = result.errors.map((error) => {
      const path = error.path || "root";
      return `${path}: ${error.message}`;
    });

    return { valid: false, messages };
  }

  /**
   * Check if a file path is a JSON schema file
   */
  static isSchemaFile(filePath: string): boolean {
    return filePath.endsWith(".json") && filePath.includes("schema");
  }
}

// Export a singleton instance
let defaultValidator: JsonSchemaValidator | null = null;

export async function getDefaultValidator(): Promise<JsonSchemaValidator> {
  if (!defaultValidator) {
    defaultValidator = new JsonSchemaValidator();
    await defaultValidator.loadSchema();
  }
  return defaultValidator;
}

