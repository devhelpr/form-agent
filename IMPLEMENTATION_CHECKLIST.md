# Implementation Checklist

## Quick Reference for Transformation

### Core Changes Required

#### 1. System Prompt Update
- [ ] Replace `src/ai/prompts.ts` content with form generation focus
- [ ] Extract key sections from `system-prompt.md`
- [ ] Create focused prompts for each tool type

#### 2. New Tools to Create

**JSON Schema Validator** (`src/tools/validation/json-schema-validator.ts`)
- [ ] Install `ajv` and `ajv-formats` dependencies
- [ ] Implement schema loading from `src/schema/form-schema.json`
- [ ] Implement validation with detailed error reporting
- [ ] Add tests

**Expression Generator** (`src/tools/form-generation/expression-generator.ts`)
- [ ] Create AI prompt for expression generation
- [ ] Implement expression syntax validation
- [ ] Support array aggregations (sum, count, avg)
- [ ] Add dependency detection
- [ ] Add tests

**Translation Generator** (`src/tools/form-generation/translation-generator.ts`)
- [ ] Create AI prompt for translation generation
- [ ] Implement translation structure generation
- [ ] Support multiple languages
- [ ] Generate language details
- [ ] Add tests

**Form JSON Generator** (`src/tools/form-generation/form-generator.ts`)
- [ ] Create main AI prompt using `system-prompt.md` content
- [ ] Implement form structure generation
- [ ] Integrate with expression generator
- [ ] Integrate with translation generator
- [ ] Integrate with schema validator
- [ ] Add tests

#### 3. Decision Schema Updates

**File**: `src/types/decision.ts`
- [ ] Add `validate_form_json` action
- [ ] Add `generate_expression` action
- [ ] Add `generate_translations` action
- [ ] Add `generate_form_json` action
- [ ] Update `tool_input` schema with new fields
- [ ] Update TypeScript `Decision` type union

#### 4. New Handlers

**File**: `src/handlers/form-handlers.ts` (NEW)
- [ ] `handleValidateFormJson()` - Validate JSON against schema
- [ ] `handleGenerateExpression()` - Generate expression via AI
- [ ] `handleGenerateTranslations()` - Generate translations via AI
- [ ] `handleGenerateFormJson()` - Main form generation handler

**File**: `src/handlers/index.ts`
- [ ] Export new form handlers

#### 5. Agent Core Updates

**File**: `src/core/agent.ts`
- [ ] Import new form handlers
- [ ] Add routing for `validate_form_json` action
- [ ] Add routing for `generate_expression` action
- [ ] Add routing for `generate_translations` action
- [ ] Add routing for `generate_form_json` action
- [ ] Update `validateDecision()` to include new actions

#### 6. CLI Updates

**File**: `src/cli.ts`
- [ ] Update description: "AI agent for generating form JSON schemas"
- [ ] Add `--output <path>` option
- [ ] Add `--validate-only` option
- [ ] Add `--languages <langs>` option
- [ ] Add `--include-translations` flag
- [ ] Update help text and examples

#### 7. Package Dependencies

**File**: `package.json
- [ ] Add `ajv` dependency
- [ ] Add `ajv-formats` dependency
- [ ] Update package description
- [ ] Update keywords: ["form", "json", "schema", "generation", "ai"]

#### 8. AI Prompts

**New Files**:
- [ ] `src/ai/prompts/form-generation.ts` - Main form generation prompt
- [ ] `src/ai/prompts/expression-generation.ts` - Expression generation prompt
- [ ] `src/ai/prompts/translation-generation.ts` - Translation generation prompt

#### 9. Type Definitions

**File**: `src/types/form-generation.ts` (NEW)
- [ ] `JsonSchemaValidationResult` interface
- [ ] `ExpressionGenerationRequest` interface
- [ ] `ExpressionGenerationResult` interface
- [ ] `TranslationGenerationRequest` interface
- [ ] `TranslationGenerationResult` interface
- [ ] `FormGenerationRequest` interface
- [ ] `FormGenerationResult` interface

#### 10. Tests

**New Test Files**:
- [ ] `src/__tests__/tools/form-generation/form-generator.test.ts`
- [ ] `src/__tests__/tools/form-generation/expression-generator.test.ts`
- [ ] `src/__tests__/tools/form-generation/translation-generator.test.ts`
- [ ] `src/__tests__/tools/validation/json-schema-validator.test.ts`
- [ ] `src/__tests__/handlers/form-handlers.test.ts`

#### 11. Documentation

- [ ] Update `README.md` with form generation focus
- [ ] Create `docs/API.md` documenting new tools
- [ ] Create `docs/EXAMPLES.md` with form generation examples
- [ ] Create `docs/EXPRESSIONS.md` documenting expression syntax
- [ ] Create `docs/TRANSLATIONS.md` documenting translation structure

## Implementation Phases

### Phase 1: Foundation (Week 1)
1. Update system prompt
2. Add JSON schema validator
3. Update decision schema
4. Create basic handlers

### Phase 2: Core Generation (Week 2)
1. Create form JSON generator
2. Create expression generator
3. Update agent core
4. Basic integration

### Phase 3: Advanced Features (Week 3)
1. Create translation generator
2. Enhance form generator
3. Update CLI
4. Integration testing

### Phase 4: Polish (Week 4)
1. Comprehensive tests
2. Documentation
3. Error handling
4. Performance optimization

## Key Files Summary

### Files to Modify
- `src/ai/prompts.ts`
- `src/core/agent.ts`
- `src/types/decision.ts`
- `src/handlers/index.ts`
- `src/cli.ts`
- `package.json`
- `README.md`

### Files to Create
- `src/tools/form-generation/form-generator.ts`
- `src/tools/form-generation/expression-generator.ts`
- `src/tools/form-generation/translation-generator.ts`
- `src/tools/validation/json-schema-validator.ts`
- `src/handlers/form-handlers.ts`
- `src/ai/prompts/form-generation.ts`
- `src/ai/prompts/expression-generation.ts`
- `src/ai/prompts/translation-generation.ts`
- `src/types/form-generation.ts`

### Test Files to Create
- `src/__tests__/tools/form-generation/form-generator.test.ts`
- `src/__tests__/tools/form-generation/expression-generator.test.ts`
- `src/__tests__/tools/form-generation/translation-generator.test.ts`
- `src/__tests__/tools/validation/json-schema-validator.test.ts`
- `src/__tests__/handlers/form-handlers.test.ts`

