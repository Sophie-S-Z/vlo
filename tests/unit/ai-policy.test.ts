import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_POLICY } from '@/features/policy/aiPolicy';

/* Plan Task D7: the AI policy page and docs/ai-policy.md say the same four statements. */

const doc = readFileSync('docs/ai-policy.md', 'utf8').replace(/\s+/g, ' ');

describe('AI policy', () => {
  it('has the four statements of the spec, with the web check in statement 3 (decision of 2026-11-08)', () => {
    expect(AI_POLICY.statements.map((s) => s.title)).toEqual([
      'Vlo trains no model on your text.',
      'No Vlo server receives your manuscript text.',
      'Pen mode loads no AI code and sends nothing unless you press "Check the web too".',
      'With your own provider key, the provider’s terms apply, and Vlo shows them first.',
    ]);
  });

  it('matches docs/ai-policy.md, with the same version and date', () => {
    expect(doc).toContain(`Version ${String(AI_POLICY.version)}, 8 November 2026.`);
    expect(AI_POLICY.date).toBe('2026-11-08');
    for (const statement of AI_POLICY.statements) {
      expect(doc).toContain(`**${statement.title}** ${statement.detail}`);
    }
  });
});
