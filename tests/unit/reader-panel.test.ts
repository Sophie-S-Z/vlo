import { describe, expect, it } from 'vitest';
import { estimateTokens } from '@/features/ai/engine/types';
import { PANEL_READERS } from '@/features/ai/prompts';
import {
  checkFits,
  CODEX_BUDGET,
  codexContext,
  privateRequest,
  readerRequest,
  splitPanel,
} from '@/features/ai/reader';
import type { CodexEntry } from '@/lib/db';

/* Plan Task K4 (roadmap F61, decision K8): the reader panel and the Codex notes it sends. */

const entry = (id: string, name: string, note: string, aliases: string[] = []): CodexEntry => ({
  id,
  projectId: 'p',
  kind: 'character',
  name,
  aliases,
  note,
  order: id,
});

const codex = [
  entry('mira', 'Mira', 'Owes the harbour master. Afraid of\n\ndeep water.', ['Mi']),
  entry('teo', 'Teo', 'Never in this scene.'),
  { ...entry('quay', 'The Quay', ''), kind: 'place' as const },
];

const scene = { id: 's1', title: 'The ledger', kind: 'scene', text: 'Mi hid the ledger on The Quay.' };

describe('codexContext', () => {
  it('holds only the entries that the text names, by any of their names', () => {
    expect(codexContext(codex, scene.text)).toBe(
      '- Mira (character, also called Mi): Owes the harbour master. Afraid of deep water.\n- The Quay (place)',
    );
    expect(codexContext(codex, 'Nobody here.')).toBe('');
  });

  it('stops at 600 tokens', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      entry(`e${String(i)}`, `Name${String(i)}`, 'A long note about the past. '.repeat(10)),
    );
    const text = many.map((e) => e.name).join(' ');
    const context = codexContext(many, text);
    expect(estimateTokens(context)).toBeLessThanOrEqual(CODEX_BUDGET);
    expect(context).toContain('Name0');
    expect(context).not.toContain('Name39');
  });
});

describe('the reader panel request', () => {
  it('sends the passage and the notes of the names in it, and its answer is not a draft', () => {
    const request = readerRequest('panel', { item: scene, passages: [], budget: 2000, codex });
    const body = request.messages[0]?.content ?? '';
    for (const reader of PANEL_READERS) expect(body).toContain(`"${reader}"`);
    expect(body).toContain('Mi hid the ledger on The Quay.');
    expect(body).toContain('<notes>\n- Mira (character, also called Mi): Owes the harbour master.');
    expect(body).not.toContain('Teo');
    expect(request).toMatchObject({ label: 'Reader panel on The ledger', result: 'panel', itemId: 's1' });
    // With no names in the text, the request holds no notes.
    const plain = readerRequest('panel', {
      item: { ...scene, text: 'Rain.' },
      passages: [],
      budget: 2000,
      codex,
    });
    expect(plain.messages[0]?.content).not.toContain('<notes>');
  });

  it('gives a private name in a note its alias', () => {
    const memoir = [entry('gran', 'Gran', 'Rosa raised me after 1994.')];
    const people = [{ id: 'rosa', variants: [{ real: 'Rosa', alias: 'Maria' }] }];
    const item = { id: 'm1', title: 'Sundays', kind: 'memory', text: 'Gran baked on Sundays.' };
    const sent = privateRequest(
      readerRequest('panel', { item, passages: [], budget: 2000, codex: memoir }),
      people,
      true,
    );
    const body = JSON.stringify(sent);
    expect(body).toContain('Maria raised me');
    expect(body).not.toContain('Rosa');
  });

  it('fits the in-browser model with a full passage and full notes', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      entry(`e${String(i)}`, `Name${String(i)}`, 'A long note about the past. '.repeat(10)),
    );
    const text = `${many.map((e) => e.name).join(' ')} ${'The tide came in. '.repeat(800)}`;
    const request = readerRequest('panel', {
      item: { ...scene, text },
      passages: [],
      budget: 1500,
      codex: many,
    });
    expect(() => {
      checkFits(request, 3500);
    }).not.toThrow();
  });
});

describe('splitPanel', () => {
  it('splits the answer into one card for each reader, from headings or labels', () => {
    const answer = [
      'Here are the notes.',
      '## First-time reader',
      'I lost track of the ledger.',
      '**Genre fan:** I want the storm.',
      '### developmental editor',
      'The stakes come late.',
      'Line editor:',
      'Line editor work is light here.',
    ].join('\n');
    expect(splitPanel(answer)).toEqual([
      { reader: 'First-time reader', notes: 'I lost track of the ledger.' },
      { reader: 'Genre fan', notes: 'I want the storm.' },
      { reader: 'Developmental editor', notes: 'The stakes come late.' },
      { reader: 'Line editor', notes: 'Line editor work is light here.' },
    ]);
    expect(splitPanel('No headings at all.')).toEqual([]);
  });
});
