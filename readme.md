# Agent Loop - Coding Agent

## Overview

This project is a specialized AI agent for generating form JSON schemas, implemented with an Agent Loop architecture.

The agent uses Vercel's AI SDK v5 to run AI LLM calls in a loop, generating valid JSON documents that conform to a form schema. It can read files, search the repository, validate generated JSON, generate expressions for calculated fields, create translations, and produce complete form JSON structures. The agent continues this loop until it reaches a final answer or a maximum number of iterations.

It includes OpenTelemetry-based observability for tracing using Jaeger.

## Supported AI Providers

The agent supports multiple AI providers through Vercel's AI SDK v5:

- **OpenAI** (GPT-5-mini, GPT-5, etc.)
- **Anthropic** (Claude Sonnet 4.5, etc.)
- **Google** (Gemini 2.5 Flash, etc.)
- **Ollama** (Local models like Granite4, etc.)

You can switch between providers using the `--provider` CLI option or by setting the appropriate environment variables.

## Key Features

- **Form JSON Generation**: Specialized agent for generating valid JSON documents conforming to form schemas with pages, components, validation, and navigation
- **Schema Validation**: Built-in validation tool that ensures generated JSON conforms to the form schema before completion
- **Expression Generation**: Generate dynamic expressions for calculated fields, conditional visibility, and real-time form behavior
- **Multi-Language Support**: Generate translations for forms in multiple languages with automatic language handling
- **Planning Phase**: Automatically analyzes project structure at startup and creates execution plans for complex form generation tasks
- **Manual Tool Calls**: Uses manual tool calls instead of OpenAI function calling for more control over the generation process
- **Work Evaluation**: Built-in evaluation tool that analyzes generated forms and provides structured feedback with scores, strengths, improvements, and specific suggestions
- **Iterative Workflow**: Agent follows a structured workflow: generate → validate → improve → re-validate until the form meets requirements
- **Multi-Provider Support**: Seamlessly switch between OpenAI, Anthropic, Google, and Ollama providers
- **Observability**: OpenTelemetry-based tracing with Jaeger integration for monitoring agent execution and debugging

## Tools Available

### Form Generation Tools (Primary)
1. **generate_form_json**: Generate complete form JSON from user requirements (main form generation action)
2. **validate_form_json**: Validate generated JSON against the form schema to ensure compliance
3. **generate_expression**: Generate dynamic expressions for calculated fields, conditional visibility, validation, and other form behaviors
4. **generate_translations**: Generate translations for forms in multiple target languages

### Supporting Tools
5. **read_files**: Read and analyze existing files (schema files, examples, etc.)
6. **search_repo**: Search the repository for patterns, examples, or related content
7. **create_plan**: Create a structured execution plan for complex form generation tasks
8. **evaluate_work**: Analyze generated forms and provide structured feedback with scores, strengths, and improvement suggestions
9. **write_patch**: Apply patches using full-file format (for modifying generated forms or other files)
10. **run_cmd**: Execute shell commands (for testing, validation, etc.)
11. **final_answer**: Complete the task and generate a summary with the final form JSON

## High-Level Agent Loop

```mermaid
flowchart TD
    A[User Goal] --> B[Planning Phase]
    B --> B1{Complex Task?}
    B1 -->|Yes| B2[Create Plan]
    B1 -->|No| C
    B2 --> C[Agent Loop]
    C --> D[LLM Decision]
    D --> E[Execute Tool]
    E --> F[Update Context]
    F --> G{Task Complete?}
    G -->|No| D
    G -->|Yes| H[Final Answer]
    
    subgraph "Available Tools"
        I[read_files]
        J[search_repo]
        K[write_patch]
        L[run_cmd]
        M[evaluate_work]
        N[create_plan]
        O[validate_form_json]
        P[generate_expression]
        Q[generate_translations]
        R[generate_form_json]
    end
    
    E -.-> I
    E -.-> J
    E -.-> K
    E -.-> L
    E -.-> M
    E -.-> N
    E -.-> O
    E -.-> P
    E -.-> Q
    E -.-> R
    
    style A fill:#e1f5fe
    style B fill:#fff3e0
    style B1 fill:#fff3e0
    style B2 fill:#fff3e0
    style C fill:#f3e5f5
    style D fill:#f3e5f5
    style E fill:#e8f5e8
    style F fill:#fff9c4
    style G fill:#ffecb3
    style H fill:#c8e6c9
    style I fill:#f0f8ff
    style J fill:#f0f8ff
    style K fill:#f0f8ff
    style L fill:#f0f8ff
    style M fill:#f0f8ff
    style N fill:#f0f8ff
    style O fill:#e1bee7
    style P fill:#e1bee7
    style Q fill:#e1bee7
    style R fill:#e1bee7
```

## Detailed Architecture Diagram

```mermaid
flowchart TD
    A[Start Agent] --> B[Initialize Config & Reset Token Stats]
    B --> C[Setup Safety Caps & Transcript]
    C --> D[Planning Phase]
    
    D --> D1{Complex Task?}
    D1 -->|Yes| D2[Create Execution Plan]
    D1 -->|No| E
    D2 --> E[Step Counter: 1 to maxSteps]
    
    E --> F[Make AI API Call with Retries]
    
    F --> G{API Call Success?}
    G -->|Failed| H[Log Error & Return with Token Stats]
    G -->|Success| I[Parse JSON Response]
    
    I --> J{Parse Success?}
    J -->|Parse Error| K[Default to final_answer]
    J -->|Success| L{Decision Type?}
    
    L -->|read_files| M[Read Files Handler]
    L -->|search_repo| N[Search Repository Handler]
    L -->|write_patch| O[Write Patch Handler]
    L -->|run_cmd| P[Run Command Handler]
    L -->|evaluate_work| Q[Evaluate Work Handler]
    L -->|create_plan| S[Create Plan Handler]
    L -->|validate_form_json| T1[Validate Form JSON Handler]
    L -->|generate_expression| T2[Generate Expression Handler]
    L -->|generate_translations| T3[Generate Translations Handler]
    L -->|generate_form_json| T4[Generate Form JSON Handler]
    L -->|final_answer| T[Generate Summary with AI]
    L -->|unknown| U[Log Error & Add to Transcript]
    
    M --> V[Update Transcript with Results]
    N --> V
    O --> W{Check Write Limit}
    P --> X{Check Command Limit}
    Q --> Y[Analyze Files & Generate Structured Feedback]
    S --> V
    T1 --> V
    T2 --> V
    T3 --> V
    T4 --> V
    U --> V
    
    W -->|Within Limit| V
    W -->|Exceeded| Z[Stop: Write Limit Reached]
    X -->|Within Limit| V
    X -->|Exceeded| AA[Stop: Command Limit Reached]
    
    Y --> AB[Add Evaluation Results to Transcript]
    AB --> V
    
    V --> AC{Step < maxSteps?}
    AC -->|Yes| E
    AC -->|No| AD[Stop: Max Steps Reached]
    
    T --> AE[Display Token Summary & Return Result]
    Z --> AE
    AA --> AE
    AD --> AE
    H --> AE
    AE --> AF[Process Exit]
    
    style A fill:#e1f5fe
    style D fill:#fff3e0
    style D1 fill:#fff3e0
    style D2 fill:#fff3e0
    style AE fill:#c8e6c9
    style AF fill:#ffcdd2
    style F fill:#fff3e0
    style L fill:#f3e5f5
    style Q fill:#e8f5e8
    style Y fill:#e8f5e8
    style AB fill:#e8f5e8
    style W fill:#fff9c4
    style X fill:#fff9c4
    style T1 fill:#e1bee7
    style T2 fill:#e1bee7
    style T3 fill:#e1bee7
    style T4 fill:#e1bee7
```

## CLI Usage

### Installation

Install globally to use from anywhere on your system:

**Option 1: Using the install-global script (recommended)**

```bash
npm run install-global
```

This will build the project and install it globally in one step.

**Option 2: Manual installation**

```bash
npm install -g .
```

If you need extra permissions, then:

```bash
chmod +x <path>/form-agent/dist/src/cli.js
```

**Option 3: Use directly without installation**

```bash
npx form-agent
```

### Basic Usage

Run the CLI in interactive mode:

```bash
form-agent
```

Or provide a prompt directly:

```bash
form-agent --prompt "Create a simple HTML page with CSS styling"
```

### CLI Options

```bash
form-agent [options]

Options:
  -p, --prompt <prompt>           Direct prompt to execute (skips interactive mode)
  -m, --max-steps <number>        Maximum number of steps to execute (default: 20)
  -w, --max-writes <number>       Maximum number of file writes (default: 10)
  -c, --max-commands <number>     Maximum number of commands to run (default: 20)
  --provider <provider>           AI provider to use (openai, anthropic, google) (default: openai)
  --model <model>                 Specific model to use (optional)
  --no-console-log                Disable console logging
  --file-log                      Enable file logging
  --log-file <path>               Log file path (default: agent-log.txt)
  --test-command <command>        Test command to run (default: npm test --silent)
  --test-args <args>              Test command arguments (comma-separated)
  -h, --help                      Display help for command
  -V, --version                   Display version number
```

### Examples

```bash
# Interactive mode
form-agent

# Direct prompt
form-agent --prompt "Create a React component for a todo list"

# With custom limits
form-agent --prompt "Build a calculator app" --max-steps 30 --max-writes 15

# With custom test command
form-agent --prompt "Create a Node.js API" --test-command "npm" --test-args "test,run"

# With file logging
form-agent --prompt "Create a website" --file-log --log-file my-agent.log

# Using different AI providers
form-agent --prompt "Create a React app" --provider anthropic
form-agent --prompt "Build a Python API" --provider google --model gemini-1.5-pro
form-agent --prompt "Write TypeScript types" --provider openai --model gpt-4
form-agent --prompt "Create a simple script" --provider ollama --model granite4:tiny-h
```

## Environment Variables:

### AI Provider API Keys (choose one):
- `OPENAI_API_KEY` : Your OpenAI API key
- `ANTHROPIC_API_KEY` : Your Anthropic API key  
- `GOOGLE_API_KEY` : Your Google API key
- `OLLAMA_BASE_URL` or `OLLAMA_HOST` : Ollama server URL (optional, defaults to localhost:11434)

### Agent Configuration:
- `AGENT_CONSOLE_LOGGING=false` : Disable console logging (default: true)
- `AGENT_FILE_LOGGING=true` : Enable file logging (default: false)
- `AGENT_LOG_FILE=path/to/log` : Log file path (default: agent-log.txt)

### Observability (Optional, Jaeger-ready):
- `JAEGER_OBS_ENABLED=true` : Enable OpenTelemetry-based observability (default: disabled)
- `SERVICE_NAME=form-agent` : Service name for traces
- `JAEGER_OTLP_TRACES_URL=http://localhost:4318/v1/traces` : OTLP HTTP traces endpoint (default: http://localhost:4318/v1/traces)
- `JAEGER_ENDPOINT` : Alternative to JAEGER_OTLP_TRACES_URL (will be converted to OTLP format)

**Note**: Metrics are currently disabled. Only traces are exported to Jaeger using OTLP (OpenTelemetry Protocol).

Notes:
- **Jaeger Setup**: To use Jaeger, ensure it's running locally. You can start it with:
  ```bash
  docker run -d --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest
  ```
- **Jaeger UI**: Access the Jaeger UI at `http://localhost:16686` to view traces.
- **Traces**: Traces are exported to Jaeger's OTLP HTTP endpoint at `http://localhost:4318/v1/traces` by default using the OTLP exporter (supports both Protobuf and JSON).
- **Metrics**: Metrics are currently disabled. Only traces are exported to Jaeger.

### Provider Selection:
You can specify which AI provider to use via CLI options:
- `--provider openai` : Use OpenAI (default)
- `--provider anthropic` : Use Anthropic
- `--provider google` : Use Google
- `--provider ollama` : Use Ollama
- `--model <model-name>` : Specify a specific model (optional)

## Installation

```bash
npm install
npm start
```

## Install and run Jaeger
```bash
docker run --rm --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 5778:5778 \
  -p 9411:9411 \
  cr.jaegertracing.io/jaegertracing/jaeger:2.11.0
```

