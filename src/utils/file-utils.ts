import { promises as fs } from "node:fs";
import { join, dirname, basename, extname } from "node:path";

/**
 * Generate a unique filename by appending a number
 */
export function generateUniqueFilename(filePath: string): string {
  const dir = dirname(filePath);
  const base = basename(filePath, extname(filePath));
  const ext = extname(filePath);
  let counter = 1;
  let newPath = filePath;

  while (true) {
    try {
      // Check if file exists synchronously (we'll use async version in actual check)
      // This is just for generating the pattern
      newPath = join(dir, `${base}-${counter}${ext}`);
      counter++;
      // We'll check existence in the calling function
      break;
    } catch {
      counter++;
    }
  }

  return newPath;
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve output filename with conflict handling
 */
export async function resolveOutputFilename(
  requestedFilename: string,
  shouldPrompt: boolean = true
): Promise<string> {
  const filePath = requestedFilename;
  const exists = await fileExists(filePath);

  if (!exists) {
    return filePath;
  }

  // File exists - need to handle conflict
  if (!shouldPrompt) {
    // Auto-generate unique name
    return await findUniqueFilename(filePath);
  }

  // Prompt user (this will be handled in CLI)
  return filePath; // Return original, CLI will handle prompt
}

/**
 * Find a unique filename by appending numbers
 */
export async function findUniqueFilename(filePath: string): Promise<string> {
  const dir = dirname(filePath);
  const base = basename(filePath, extname(filePath));
  const ext = extname(filePath);
  let counter = 1;
  let newPath: string;

  do {
    newPath = join(dir, `${base}-${counter}${ext}`);
    counter++;
  } while (await fileExists(newPath));

  return newPath;
}

/**
 * Extract JSON from markdown code blocks
 */
export function extractJsonFromMarkdown(content: string): string | null {
  // Try to find JSON in markdown code blocks
  const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  // Try to find JSON object directly
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return null;
}

/**
 * Extract form JSON from agent transcript or result
 */
export function extractFormJsonFromContent(content: string): object | null {
  try {
    // Try to extract from markdown code blocks first
    const jsonString = extractJsonFromMarkdown(content);
    if (jsonString) {
      return JSON.parse(jsonString);
    }

    // Try parsing the entire content
    return JSON.parse(content);
  } catch {
    return null;
  }
}

