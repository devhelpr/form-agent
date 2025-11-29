# Transformation Plan: Generic Coding Agent → Form JSON Generation Agent

## Overview
Transform the current generic coding agent into a specialized agent that generates JSON documents conforming to the form schema (`src/schema/form-schema.json`). The agent will use the system prompt (`system-prompt.md`) as guidance and include specialized tools for validation, expression generation, and translation generation.

## Current Architecture Analysis

### Existing Components
- **Agent Core** (`src/core/agent.ts`): Main agent loop with decision-making
- **Decision Schema** (`src/types/decision.ts`): Defines available actions
- **Tools** (`src/tools/`): File operations, command execution, evaluation, planning, project analysis, validation
- **Handlers** (`src/handlers/`): Route decisions to appropriate tool handlers
- **AI Integration** (`src/ai/`): API calls, prompts, client management
- **CLI** (`src/cli.ts`): Command-line interface

### Current Actions
- `read_files`, `search_repo`, `write_patch`, `run_cmd`, `evaluate_work`, `create_plan`, `analyze_project`, `final_answer`

## Transformation Strategy

### Phase 1: Core System Prompt Update
**Goal**: Replace generic coding prompt with form JSON generation prompt

**Changes**:
1. Update `src/ai/prompts.ts` to use content from `system-prompt.md`
2. Modify prompt to focus on:
   - Generating valid JSON conforming to form schema
   - Understanding form structure (pages, components, validation, expressions, translations)
   - Following best practices from system-prompt.md

**Files to Modify**:
- `src/ai/prompts.ts` - Replace prompt content

### Phase 2: New Tools Development

#### 2.1 JSON Schema Validator Tool
**Purpose**: Validate generated JSON against `src/schema/form-schema.json`

**Implementation**:
- **File**: `src/tools/validation/json-schema-validator.ts`
- **Features**:
  - Load and parse JSON schema from `src/schema/form-schema.json`
  - Validate JSON documents against schema
  - Provide detailed error messages with paths
  - Support for JSON Schema Draft 2020-12
- **Dependencies**: Add `ajv` or similar JSON schema validator library

**Tool Interface**:
```typescript
interface JsonSchemaValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
    schemaPath: string;
  }>;
  warnings?: string[];
}
```

#### 2.2 Expression Generator Tool
**Purpose**: Generate expressions for form fields based on requirements

**Implementation**:
- **File**: `src/tools/form-generation/expression-generator.ts`
- **Features**:
  - Generate expressions for calculated fields
  - Validate expression syntax
  - Suggest dependencies
  - Support array aggregations (sum, count, avg)
  - Handle conditional logic

**Tool Interface**:
```typescript
interface ExpressionGenerationRequest {
  description: string; // e.g., "Calculate total as price * quantity"
  fieldIds: string[]; // Available field IDs
  context?: {
    fieldType?: string;
    mode?: "value" | "visibility" | "validation" | "disabled" | "required";
  };
}

interface ExpressionGenerationResult {
  expression: string;
  dependencies: string[];
  mode: string;
  explanation: string;
}
```

#### 2.3 Translation Generator Tool
**Purpose**: Generate translation objects for multi-language forms

**Implementation**:
- **File**: `src/tools/form-generation/translation-generator.ts`
- **Features**:
  - Generate translations for form structure
  - Support multiple languages
  - Maintain translation keys structure
  - Generate default error messages
  - Generate UI text translations

**Tool Interface**:
```typescript
interface TranslationGenerationRequest {
  formJson: object; // The form JSON to translate
  targetLanguages: string[]; // e.g., ["es", "fr", "de"]
  sourceLanguage?: string; // Default: "en"
}

interface TranslationGenerationResult {
  translations: {
    [languageCode: string]: TranslationEntry;
  };
  languageDetails: Array<{
    code: string;
    name: string;
    nativeName: string;
  }>;
}
```

#### 2.4 Form JSON Generator Tool (Main Tool)
**Purpose**: Generate complete form JSON from user prompt

**Implementation**:
- **File**: `src/tools/form-generation/form-generator.ts`
- **Features**:
  - Parse user requirements
  - Generate form structure (pages, components)
  - Apply best practices from system-prompt.md
  - Integrate with expression generator
  - Integrate with translation generator
  - Validate output with JSON schema validator

**Tool Interface**:
```typescript
interface FormGenerationRequest {
  userPrompt: string;
  options?: {
    includeTranslations?: boolean;
    languages?: string[];
    validateSchema?: boolean;
  };
}

interface FormGenerationResult {
  formJson: object;
  validationResult?: JsonSchemaValidationResult;
  translations?: TranslationGenerationResult;
  metadata: {
    pageCount: number;
    componentCount: number;
    hasExpressions: boolean;
    hasTranslations: boolean;
  };
}
```

### Phase 3: Update Decision Schema

**File**: `src/types/decision.ts`

**New Actions to Add**:
1. `validate_form_json` - Validate JSON against schema
2. `generate_expression` - Generate expression for form field
3. `generate_translations` - Generate translations for form
4. `generate_form_json` - Generate complete form JSON (main action)

**Updated Decision Schema**:
```typescript
export const DecisionSchema = z.object({
  action: z.enum([
    // Keep existing actions for backward compatibility (or remove if not needed)
    "read_files",
    "search_repo", 
    "write_patch",
    "run_cmd",
    "evaluate_work",
    "create_plan",
    "analyze_project",
    // New form-specific actions
    "validate_form_json",
    "generate_expression",
    "generate_translations", 
    "generate_form_json",
    "final_answer",
  ]),
  tool_input: z.object({
    // Existing tool inputs...
    // New tool inputs:
    formJson: z.string().optional().describe("JSON string to validate"),
    schemaPath: z.string().optional().describe("Path to schema file"),
    expressionRequest: z.object({...}).optional(),
    translationRequest: z.object({...}).optional(),
    formGenerationRequest: z.object({...}).optional(),
  }).optional(),
  rationale: z.string().optional(),
});
```

### Phase 4: Create New Handlers

**Files to Create**:
1. `src/handlers/form-handlers.ts` - Handle all form-related actions
2. `src/handlers/index.ts` - Export new handlers

**Handler Functions**:
```typescript
export async function handleValidateFormJson(
  decision: Decision,
  transcript: MessageArray,
  logConfig: LogConfig
): Promise<void>

export async function handleGenerateExpression(
  decision: Decision,
  transcript: MessageArray,
  logConfig: LogConfig,
  aiProvider?: AIProvider
): Promise<void>

export async function handleGenerateTranslations(
  decision: Decision,
  transcript: MessageArray,
  logConfig: LogConfig,
  aiProvider?: AIProvider
): Promise<void>

export async function handleGenerateFormJson(
  decision: Decision,
  transcript: MessageArray,
  logConfig: LogConfig,
  aiProvider?: AIProvider
): Promise<void>
```

### Phase 5: Update Agent Core

**File**: `src/core/agent.ts`

**Changes**:
1. Import new handlers
2. Add routing logic for new actions
3. Update `validateDecision` function to include new actions
4. Modify system prompt loading to use form-specific prompt

### Phase 6: Update CLI

**File**: `src/cli.ts`

**Changes**:
1. Update description to reflect form JSON generation purpose
2. Add CLI options for:
   - `--output <path>` - Output path for generated JSON
   - `--validate-only` - Only validate, don't generate
   - `--languages <langs>` - Comma-separated language codes
   - `--include-translations` - Generate translations
3. Update help text and examples

### Phase 7: Create AI Prompts for Form Generation

**Files to Create**:
1. `src/ai/prompts/form-generation.ts` - Prompt for generating form JSON
2. `src/ai/prompts/expression-generation.ts` - Prompt for generating expressions
3. `src/ai/prompts/translation-generation.ts` - Prompt for generating translations

**Content Strategy**:
- Extract relevant sections from `system-prompt.md`
- Create focused prompts for each tool
- Include examples and best practices

### Phase 8: Update Package Dependencies

**File**: `package.json`

**New Dependencies**:
- `ajv` - JSON Schema validator
- `ajv-formats` - Additional format validators for JSON Schema

**Update Scripts**:
- Add `validate-schema` script to test schema validation
- Update description and keywords

### Phase 9: Testing Strategy

**Test Files to Create**:
1. `src/__tests__/tools/form-generation/form-generator.test.ts`
2. `src/__tests__/tools/form-generation/expression-generator.test.ts`
3. `src/__tests__/tools/form-generation/translation-generator.test.ts`
4. `src/__tests__/tools/validation/json-schema-validator.test.ts`
5. `src/__tests__/handlers/form-handlers.test.ts`

**Test Cases**:
- Validate generated JSON against schema
- Test expression generation with various scenarios
- Test translation generation for multiple languages
- Test form generation with different requirements
- Test error handling and edge cases

### Phase 10: Documentation Updates

**Files to Update/Create**:
1. `README.md` - Update with form generation focus
2. `docs/API.md` - Document new tools and handlers
3. `docs/EXAMPLES.md` - Provide examples of generated forms
4. `docs/EXPRESSIONS.md` - Document expression syntax and examples
5. `docs/TRANSLATIONS.md` - Document translation structure

## Implementation Order

### Sprint 1: Foundation
1. ✅ Update system prompt (`src/ai/prompts.ts`)
2. ✅ Add JSON schema validator tool
3. ✅ Update decision schema with new actions
4. ✅ Create basic form handlers

### Sprint 2: Core Generation
1. ✅ Create form JSON generator tool
2. ✅ Create expression generator tool
3. ✅ Update agent core to handle new actions
4. ✅ Basic integration testing

### Sprint 3: Advanced Features
1. ✅ Create translation generator tool
2. ✅ Enhance form generator with best practices
3. ✅ Add validation integration
4. ✅ Update CLI with new options

### Sprint 4: Polish & Testing
1. ✅ Comprehensive test suite
2. ✅ Documentation
3. ✅ Error handling improvements
4. ✅ Performance optimization

## File Structure After Transformation

```
src/
├── ai/
│   ├── prompts/
│   │   ├── form-generation.ts (NEW)
│   │   ├── expression-generation.ts (NEW)
│   │   └── translation-generation.ts (NEW)
│   ├── prompts.ts (MODIFIED)
│   └── ...
├── core/
│   └── agent.ts (MODIFIED)
├── handlers/
│   ├── form-handlers.ts (NEW)
│   └── index.ts (MODIFIED)
├── tools/
│   ├── form-generation/ (NEW)
│   │   ├── form-generator.ts
│   │   ├── expression-generator.ts
│   │   └── translation-generator.ts
│   ├── validation/
│   │   ├── json-schema-validator.ts (NEW)
│   │   └── ...
│   └── index.ts (MODIFIED)
├── types/
│   ├── decision.ts (MODIFIED)
│   └── form-generation.ts (NEW)
├── cli.ts (MODIFIED)
└── schema/
    └── form-schema.json (EXISTING)
```

## Key Design Decisions

1. **Backward Compatibility**: Keep existing actions initially, remove later if not needed
2. **Modular Tools**: Each tool is independent and can be used separately
3. **AI Integration**: Use AI for complex generation, validation for correctness
4. **Schema-First**: Always validate against schema before returning results
5. **Progressive Enhancement**: Start with basic generation, add features incrementally

## Success Criteria

1. ✅ Agent can generate valid form JSON from natural language prompts
2. ✅ Generated JSON always validates against schema
3. ✅ Expression generation produces valid, working expressions
4. ✅ Translation generation creates complete translation objects
5. ✅ CLI provides intuitive interface for form generation
6. ✅ Comprehensive test coverage (>80%)
7. ✅ Documentation is complete and accurate

## Risks & Mitigations

1. **Risk**: JSON Schema validation complexity
   - **Mitigation**: Use proven library (ajv), comprehensive testing

2. **Risk**: Expression generation accuracy
   - **Mitigation**: Validate expressions, provide examples, test extensively

3. **Risk**: Translation quality
   - **Mitigation**: Use AI for generation, allow manual review/editing

4. **Risk**: Schema changes breaking compatibility
   - **Mitigation**: Version schema, maintain backward compatibility where possible

## Next Steps

1. Review and approve this plan
2. Set up development environment
3. Begin Sprint 1 implementation
4. Create initial test cases
5. Iterate based on feedback

