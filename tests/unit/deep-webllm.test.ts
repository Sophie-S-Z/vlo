import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

/*
 * The deep AI check reads two fields of WebLLM's model pipeline that the library does not document: the
 * tokenizer and the logit processor. This test fails when an update of the library changes them, so the
 * update cannot break the check without notice.
 */

const library = readFileSync('node_modules/@mlc-ai/web-llm/lib/index.js', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };

describe('WebLLM fields for the deep check', () => {
  test('the version is pinned', () => {
    expect(pkg.dependencies['@mlc-ai/web-llm']).toBe('0.2.87');
  });

  test('the engine keeps each pipeline in loadedModelIdToPipeline', () => {
    expect(library).toContain('this.loadedModelIdToPipeline.set(modelId, newPipeline)');
  });

  test('the pipeline keeps its tokenizer, which has encode', () => {
    expect(library).toContain('this.tokenizer = tokenizer;');
    expect(library).toMatch(/this\.tokenizer\.encode\(/);
  });

  test('sampling sends the raw logits through the pipeline logit processor first', () => {
    const at = library.indexOf('// 1. Apply logitProcessor on CPU');
    expect(at).toBeGreaterThan(0);
    const part = library.slice(at, at + 800);
    expect(part).toContain('if (this.logitProcessor !== undefined)');
    expect(part).toContain('this.logitProcessor.processLogits(logitsOnCPUArray)');
  });

  test('the engine has forwardTokensAndSample and resetChat', () => {
    expect(library).toMatch(/forwardTokensAndSample\(inputIds, isPrefill, modelId\)/);
    expect(library).toMatch(
      /resetChat\(\) \{\s*return __awaiter\(this, arguments, void 0, function\* \(keepStats = false, modelId\)/,
    );
  });
});
