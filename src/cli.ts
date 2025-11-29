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
  await initObservability({ serviceName: "form-agent-cli" });

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
    
    console.error(
      `❌ Error: ${requiredEnvVar} environment variable is not set`
    );
    console.log(`Please set your ${provider} API key:`);
    console.log(`export ${requiredEnvVar}="your-api-key-here"`);
    console.log("\nSupported providers:");
    console.log('  - OpenAI: export OPENAI_API_KEY="your-key"');
    console.log('  - Anthropic: export ANTHROPIC_API_KEY="your-key"');
    console.log('  - Google: export GOOGLE_API_KEY="your-key"');
    console.log("  - Ollama: No API key required (runs locally)");
    
    // Shutdown observability to flush the error span
    await shutdownObservability();
    process.exit(1);
  }

  let userPrompt: string;

  // Get user prompt
  if (options.prompt) {
    userPrompt = options.prompt;
    console.log(`🎯 Using prompt: ${userPrompt}`);
  } else {
    // Interactive mode
    console.log("🤖 Form Agent - AI Form JSON Generator");
    console.log(
      "This agent will help you generate form JSON schemas conforming to the form-schema.json specification.\n"
    );
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
        console.log("👋 until next time!");
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

  // Show compact startup info
  const { log: clackLog } = await import("@clack/prompts");
  clackLog.info(`Starting form generation agent`);
  clackLog.info(`Prompt: ${userPrompt.substring(0, 60)}${userPrompt.length > 60 ? "..." : ""}`);
  clackLog.info(`Max steps: ${maxSteps} • Provider: ${provider}${options.model ? ` (${options.model})` : ""}`);
  console.log(""); // Empty line for spacing

  // Set up configurable timeout if specified
  let timeoutId: NodeJS.Timeout | null = null;
  if (timeoutSeconds > 0) {
    timeoutId = setTimeout(async () => {
      console.log(
        `⚠️  Process timeout after ${timeoutSeconds} seconds - forcing exit`
      );
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
      clackLog.error("Agent terminated due to fatal error");
      await shutdownObservability();
      process.exit(1);
    }

    const { log: clackLog } = await import("@clack/prompts");
    console.log(""); // Empty line for spacing
    clackLog.success("Agent completed successfully!");

    // Handle output file if specified
    const outputFile = options.outputFile || "form.json";
    if (outputFile) {
      await handleOutputFile(result, outputFile);
    } else {
      console.log("📊 Final result:", result);
    }

    // Shutdown observability to flush traces before exit
    await shutdownObservability();
    process.exit(0);
  } catch (error) {
    // Clear timeout on error
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    console.error("\n❌ Agent execution failed:", error);
    
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
  console.error("❌ Uncaught Exception:", error);
  
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
  console.error("❌ Unhandled Rejection:", reason);
  
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
    console.warn(
      `⚠️  Could not extract form JSON from result. Saving raw message to ${outputFile}`
    );
    await fs.writeFile(outputFile, result.message, "utf-8");
    console.log(`📄 Saved to: ${outputFile}`);
    return;
  }

  // Check if file exists
  const filePath = join(process.cwd(), outputFile);
  const exists = await fileExists(filePath);

  let finalPath = filePath;

  if (exists) {
    // Prompt user to override or generate unique name
    const shouldOverride = await confirm({
      message: `File ${outputFile} already exists. Overwrite it?`,
      initialValue: false,
    });

    if (isCancel(shouldOverride)) {
      console.log("❌ Operation cancelled");
      process.exit(0);
    }

    if (!shouldOverride) {
      // Generate unique filename
      finalPath = await findUniqueFilename(filePath);
      const finalFilename = finalPath.split("/").pop() || finalPath;
      console.log(`📝 Using unique filename: ${finalFilename}`);
    } else {
      console.log(`📝 Overwriting existing file: ${outputFile}`);
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
    console.log(`✅ Form JSON saved to: ${finalFilename}`);
    console.log(`📊 Metadata:`, {
      pages: (formJson as any)?.app?.pages?.length || 0,
      title: (formJson as any)?.app?.title || "N/A",
    });
  } catch (error) {
    console.error(`❌ Failed to write file: ${error}`);
    throw error;
  }
}

// Run the CLI
main().catch(async (error) => {
  console.error("❌ CLI execution failed:", error);
  
  // Record as error span
  const { recordErrorSpan } = await import("./utils/observability");
  await recordErrorSpan(error, "cli_execution_failed", {
    error_type: "cli_execution_failed",
  });
  
  await shutdownObservability();
  process.exit(1);
});
