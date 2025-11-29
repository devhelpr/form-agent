#!/usr/bin/env node

import { Command } from "commander";
import { text, isCancel, confirm } from "@clack/prompts";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { runCodingAgent } from "./core/agent.js";
import {
  fileExists,
  findUniqueFilename,
  extractFormJsonFromContent,
} from "./utils/file-utils.js";
import {
  initObservability,
  withSpan,
  shutdownObservability,
} from "./utils/observability.js";
import { AIProvider } from "./ai/ai-client.js";

const program = new Command();

program
  .name("form-agent")
  .description(
    "AI agent for generating form JSON schemas conforming to the form-schema.json specification"
  )
  .version("1.0.0");

// Add command line options
program
  .option(
    "-p, --prompt <prompt>",
    "Direct prompt to execute (skips interactive mode)"
  )
  .option(
    "-m, --max-steps <number>",
    "Maximum number of steps to execute",
    "20"
  )
  .option("-w, --max-writes <number>", "Maximum number of file writes", "10")
  .option(
    "-c, --max-commands <number>",
    "Maximum number of commands to run",
    "20"
  )
  .option("--no-console-log", "Disable console logging")
  .option("--file-log", "Enable file logging")
  .option("--log-file <path>", "Log file path", "agent-log.txt")
  .option(
    "--test-command <command>",
    "Test command to run (default: npm test --silent)"
  )
  .option("--test-args <args>", "Test command arguments (comma-separated)")
  .option(
    "--timeout <seconds>",
    "Maximum time to wait for agent completion (default: 300 seconds, 0 = no timeout)",
    "300"
  )
  .option(
    "--provider <provider>",
    "AI provider to use (openai, anthropic, google)",
    "openai"
  )
  .option("--model <model>", "Specific model to use (optional)")
  .option(
    "--output-file <filename>",
    "Output filename for generated form JSON (default: form.json)"
  )
  .option(
    "--validate-only",
    "Only validate form JSON, don't generate (requires --prompt with JSON)"
  )
  .option(
    "--languages <langs>",
    "Comma-separated language codes for translations (e.g., es,fr,de)"
  )
  .option(
    "--include-translations",
    "Generate translations for the form"
  )
  .parse();

async function main() {
  const options = program.opts();
  // Initialize optional observability (no-op if disabled or deps missing)
  // Wrap in try-catch to ensure failures don't break the application
  try {
    await initObservability({ serviceName: "form-agent-cli" });
  } catch (error) {
    // Silently fail - observability is optional
    // Application continues without tracing
  }

  // Check for AI provider API key
  const provider = options.provider as AIProvider;
  const requiredEnvVars = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    ollama: null, // Ollama doesn't require an API key
  };

  const requiredEnvVar = requiredEnvVars[provider];
  if (requiredEnvVar && !process.env[requiredEnvVar]) {
    const error = new Error(`${requiredEnvVar} environment variable is not set`);
    
    // Record as error span before exiting
    const { recordErrorSpan, getJaegerEndpoint } = await import("./utils/observability");
    const jaegerEndpoint = getJaegerEndpoint() || "http://localhost:4318/v1/traces";
    await recordErrorSpan(error, "missing_api_key", {
      error_type: "missing_api_key",
      provider,
      required_env_var: requiredEnvVar,
      jaeger_endpoint: jaegerEndpoint,
    });
    
    // Minimal error - show only essential info
    const { log: clackLog } = await import("@clack/prompts");
    clackLog.error(`${requiredEnvVar} not set`);
    clackLog.info(`Set: export ${requiredEnvVar}="your-key"`);
    
    // Shutdown observability to flush the error span
    await shutdownObservability();
    process.exit(1);
  }

  let userPrompt: string;

  // Get user prompt
  if (options.prompt) {
    userPrompt = options.prompt;
    // Don't log prompt - it's verbose, details go to traces
  } else {
    // Interactive mode
    try {
      const promptResult = await text({
        message: "What would you like the agent to help you with?",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Please enter a prompt describing what you want to accomplish";
          }
          return undefined;
        },
      });

      if (isCancel(promptResult)) {
        process.exit(0);
      }

      userPrompt = promptResult;
    } catch (error) {
      // Rethrow unknown errors
      throw error;
    }
  }
  // Parse numeric options
  const maxSteps = parseInt(options.maxSteps, 10);
  const maxWrites = parseInt(options.maxWrites, 10);
  const maxCommands = parseInt(options.maxCommands, 10);
  const timeoutSeconds = parseInt(options.timeout, 10);

  // Parse test command
  let testCommand = { cmd: "npm", args: ["test", "--silent"] };
  if (options.testCommand) {
    testCommand.cmd = options.testCommand;
    if (options.testArgs) {
      testCommand.args = options.testArgs
        .split(",")
        .map((arg: string) => arg.trim());
    }
  }

  // Configure logging
  const logging = {
    enabled: options.consoleLog !== false,
    fileLogging: {
      enabled: options.fileLog || false,
      filePath: options.logFile,
    },
  };

  // Minimal startup - no verbose output
  // All details go to traces and log files

  // Set up configurable timeout if specified
  let timeoutId: NodeJS.Timeout | null = null;
  if (timeoutSeconds > 0) {
    timeoutId = setTimeout(async () => {
      // Minimal timeout message
      const { log: clackLog } = await import("@clack/prompts");
      clackLog.error(`Timeout after ${timeoutSeconds}s`);
      await shutdownObservability();
      process.exit(0);
    }, timeoutSeconds * 1000);
  }

  try {
    const result = await withSpan("agent.cli.run", async (span) => {
      if (span) {
        span.setAttribute("agent.cli.user_prompt", userPrompt.substring(0, 500));
        span.setAttribute("agent.cli.user_prompt_length", userPrompt.length);
        span.setAttribute("agent.cli.max_steps", maxSteps);
        span.setAttribute("agent.cli.max_writes", maxWrites);
        span.setAttribute("agent.cli.max_commands", maxCommands);
        span.setAttribute("agent.cli.provider", provider);
        span.setAttribute("agent.cli.model", options.model || "default");
        span.setAttribute("agent.cli.test_command", JSON.stringify(testCommand));
        span.setAttribute("agent.cli.timeout_seconds", timeoutSeconds);
      }
      return await runCodingAgent(userPrompt, {
        maxSteps,
        hardCaps: {
          maxWrites,
          maxCmds: maxCommands,
        },
        testCommand,
        logging,
        aiProvider: provider,
        aiModel: options.model,
      });
    });

    // Clear timeout since we completed successfully
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Check if this was a fatal error
    if ((result as any).fatal) {
      const { log: clackLog } = await import("@clack/prompts");
      clackLog.error("Fatal error");
      await shutdownObservability();
      process.exit(1);
    }

    // Handle output file if specified
    const outputFile = options.outputFile || "form.json";
    if (outputFile) {
      await handleOutputFile(result, outputFile);
    }
    
    // Minimal completion message
    const { log: clackLog } = await import("@clack/prompts");
    clackLog.success("Complete");

    // Shutdown observability to flush traces before exit
    await shutdownObservability();
    process.exit(0);
  } catch (error) {
    // Clear timeout on error
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    // Minimal error display - details go to traces
    const { log: clackLog } = await import("@clack/prompts");
    const errorMessage = error instanceof Error ? error.message : String(error);
    clackLog.error(`Failed: ${errorMessage.substring(0, 60)}`);
    
    // Record as error span
    const { recordErrorSpan } = await import("./utils/observability");
    await recordErrorSpan(error, "agent_execution_failed", {
      error_type: "agent_execution_failed",
      user_prompt: userPrompt.substring(0, 200),
    });
    
    // Shutdown observability to flush traces even on error
    await shutdownObservability();
    process.exit(1);
  }
}

// Handle uncaught errors
process.on("uncaughtException", async (error) => {
  // Minimal error display - details go to traces
  const { log: clackLog } = await import("@clack/prompts");
  clackLog.error("Uncaught exception");
  
  // Record as error span
  const { recordErrorSpan } = await import("./utils/observability");
  await recordErrorSpan(error, "uncaught_exception", {
    error_type: "uncaught_exception",
    process_pid: process.pid,
  });
  
  await shutdownObservability();
  process.exit(1);
});

process.on("unhandledRejection", async (reason, promise) => {
  // Minimal error display - details go to traces
  const { log: clackLog } = await import("@clack/prompts");
  clackLog.error("Unhandled rejection");
  
  // Record as error span
  const { recordErrorSpan } = await import("./utils/observability");
  await recordErrorSpan(
    reason instanceof Error ? reason : new Error(String(reason)),
    "unhandled_rejection",
    {
      error_type: "unhandled_rejection",
      reason_type: typeof reason,
      process_pid: process.pid,
    }
  );
  
  await shutdownObservability();
  process.exit(1);
});

/**
 * Handle output file - extract form JSON and save to file
 */
async function handleOutputFile(
  result: { steps: number; message: string; formJson?: object },
  outputFile: string
): Promise<void> {
  // Use form JSON from result if available, otherwise try to extract from message
  let formJson: object | null = result.formJson || null;

  if (!formJson) {
    // Try to extract from message as fallback
    formJson = extractFormJsonFromContent(result.message);
  }

  if (!formJson) {
    // Minimal warning - details in traces
    const { log: clackLog } = await import("@clack/prompts");
    clackLog.warn(`Could not extract form JSON, saving raw message`);
    await fs.writeFile(outputFile, result.message, "utf-8");
    return;
  }

  // Check if file exists
  const filePath = join(process.cwd(), outputFile);
  const exists = await fileExists(filePath);

  let finalPath = filePath;

  if (exists) {
    // Stop any active spinner before prompting user
    const { ui } = await import("./utils/ui");
    ui.stopSpinner();

    // Prompt user to override or generate unique name
    const shouldOverride = await confirm({
      message: `File ${outputFile} already exists. Overwrite it?`,
      initialValue: false,
    });

    if (isCancel(shouldOverride)) {
      // Exit cleanly without showing additional messages
      process.exit(0);
    }

    if (!shouldOverride) {
      // Generate unique filename
      finalPath = await findUniqueFilename(filePath);
    }
  }

  // Write the form JSON to file
  try {
    await fs.writeFile(
      finalPath,
      JSON.stringify(formJson, null, 2),
      "utf-8"
    );
    const finalFilename = finalPath.split("/").pop() || finalPath;
    // Minimal success message
    const { log: clackLog } = await import("@clack/prompts");
    clackLog.success(`Saved: ${finalFilename}`);
  } catch (error) {
    const { log: clackLog } = await import("@clack/prompts");
    clackLog.error(`Failed to write file`);
    throw error;
  }
}

// Run the CLI
main().catch(async (error) => {
  // Minimal error display - details go to traces
  const { log: clackLog } = await import("@clack/prompts");
  clackLog.error("CLI execution failed");
  
  // Record as error span
  const { recordErrorSpan } = await import("./utils/observability");
  await recordErrorSpan(error, "cli_execution_failed", {
    error_type: "cli_execution_failed",
  });
  
  await shutdownObservability();
  process.exit(1);
});
