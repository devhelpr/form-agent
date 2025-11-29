# Ollama Structured Output Implementation Review

## Current Status

Based on the [Ollama structured outputs blog post](https://ollama.com/blog/structured-outputs), Ollama **does support** structured outputs via the `format` parameter (as of December 2024). However, our current implementation may not be leveraging this feature correctly.

## Current Implementation Analysis

### 1. **AI SDK Integration** (`src/ai/ai-client.ts`)
- ✅ Using `ai-sdk-ollama` v1.0.0
- ✅ Using `ai` SDK v5.0.0
- ✅ Properly creating Ollama model instance: `ollama(model)`

### 2. **Structured Output Usage** (`src/ai/api-calls.ts`)
- ✅ Using `generateObject()` with Zod schemas
- ⚠️ **Issue**: The AI SDK should automatically convert Zod schemas to JSON schema and pass to Ollama's `format` parameter, but this may not be working correctly
- ✅ **Fallback implemented**: When schema errors occur, we fall back to `generateText()` with JSON parsing

### 3. **Potential Issues**

#### Issue 1: AI SDK Schema Conversion
The AI SDK's `generateObject()` should automatically:
1. Convert Zod schema to JSON schema
2. Pass it to Ollama via the `format` parameter

However, this might not be working if:
- The AI SDK version doesn't fully support Ollama structured outputs
- The schema conversion is failing silently
- The `format` parameter isn't being passed correctly

#### Issue 2: Complex Schemas
According to the Ollama blog post, Ollama supports JSON schema format. However, very complex schemas (like our form schema with nested objects, arrays, and `$ref` patterns) might:
- Exceed Ollama's schema complexity limits
- Not be fully supported by all Ollama models
- Require simplification

## Recommendations

### Option 1: Verify AI SDK Support (Recommended First Step)
1. **Check AI SDK Documentation**: Verify that `ai-sdk-ollama` v1.0.0 properly supports structured outputs
2. **Test with Simple Schema**: Test with a simple Zod schema to verify the conversion works
3. **Add Debugging**: Log the actual request being sent to Ollama to see if `format` parameter is included

### Option 2: Explicit Format Parameter (If AI SDK Doesn't Support)
If the AI SDK doesn't automatically handle this, we could:
1. Install `zod-to-json-schema` package
2. Manually convert Zod schemas to JSON schema
3. Pass the `format` parameter explicitly via `providerOptions`

```typescript
// Example implementation
import { zodToJsonSchema } from 'zod-to-json-schema';

if (aiClient.getProvider() === "ollama") {
  generateObjectParams.providerOptions = {
    ollama: {
      format: zodToJsonSchema(schema),
    },
  };
}
```

### Option 3: Keep Fallback, Improve Primary Path
1. **Keep the current fallback** (it's working as a safety net)
2. **Improve error detection**: Better identify when Ollama structured output fails
3. **Add retry logic**: Try structured output first, then fall back if needed

### Option 4: Model-Specific Handling
Some Ollama models might support structured outputs better than others:
- Test with different models (llama3.1, llama3.2, etc.)
- Document which models work best with structured outputs
- Provide model recommendations in documentation

## Current Fallback Implementation

The current fallback implementation is **good** and should be kept because:
1. ✅ It handles cases where structured output fails
2. ✅ It properly extracts JSON from markdown code blocks
3. ✅ It validates against the schema
4. ✅ It maintains the same return format

However, we should improve the **primary path** to use Ollama's native structured output support when possible.

## Action Items

1. **Immediate**: Verify if AI SDK is properly passing `format` parameter to Ollama
   - Add logging to see the actual request
   - Test with a simple schema first

2. **Short-term**: If AI SDK doesn't support it, implement explicit format parameter
   - Add `zod-to-json-schema` dependency
   - Convert schemas explicitly for Ollama

3. **Long-term**: Document Ollama usage and limitations
   - Update README with Ollama-specific notes
   - Document which models work best
   - Provide troubleshooting guide

## Testing Recommendations

1. Test with simple schema:
```typescript
const SimpleSchema = z.object({
  name: z.string(),
  age: z.number(),
});
```

2. Test with complex schema (form schema):
```typescript
// Our actual FormJsonSchema
```

3. Test with different Ollama models:
- `llama3.1:8b`
- `llama3.2:1b`
- `granite4:tiny-h` (current default)

4. Monitor error patterns:
- When does structured output fail?
- What error messages do we get?
- Which schemas work vs. don't work?

## Conclusion

The current implementation with fallback is **functional and safe**, but we should:
1. Investigate why structured output isn't working with Ollama
2. Implement explicit format parameter if needed
3. Keep the fallback as a safety net
4. Document Ollama-specific behavior and limitations

The fallback ensures the code works even if structured output fails, which is good defensive programming. However, using native structured outputs would be more efficient and reliable when it works.

