import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { castSentences, cueSpeaker } from '@/features/editor/readAloud/dialogue';
import { buildExportDoc } from '@/features/export/build';
import { toFdx, toFountain } from '@/features/export/fountain';
import { exportNotices } from '@/features/export/notices';
import { readFountain } from '@/features/import/fountain';
import { editorSchemas, toBackup } from '@/features/import/tree';
import { projectDef } from '@/features/library/templates';
import type { CodexEntry } from '@/lib/db';
import { updateToJson } from '@/features/export/read';

/* Roadmap 2 F63, plan Task M3: Fountain in and out, and Final Draft out. */

const FIXTURE = readFileSync('tests/fixtures/scripts/night-ferry.fountain', 'utf8');

function imported(text = FIXTURE) {
  const source = readFountain('night-ferry.fountain', text);
  const backup = toBackup({ ...source, skipped: [] }, ['script'], 1);
  const doc = buildExportDoc({
    project: backup.project,
    items: backup.items,
    scope: { kind: 'project' },
    updates: backup.updates,
  });
  return { source, backup, doc };
}

describe('Fountain', () => {
  test('a file imports with each role, and each act, sequence and scene in the binder', () => {
    const { backup } = imported();
    expect(backup.project.title).toBe('Night Ferry');
    expect(backup.project.authorName).toBe('Ada Marlow');
    const def = projectDef(backup.project);
    expect(backup.items.map((i) => [def.kindLabel[i.kind], i.title])).toEqual([
      ['Act', 'Act One'],
      ['Sequence', 'The Harbour'],
      ['Scene', 'INT. FERRY CABIN - NIGHT'],
      ['Scene', 'EXT. DECK - CONTINUOUS'],
      ['Act', 'Act Two'],
      ['Scene', 'FLASHBACK'],
    ]);
    const first = backup.items[2];
    const roles = updateToJson(backup.updates.get(first?.id ?? '') ?? new Uint8Array()).content?.map(
      (line): unknown => line.attrs?.role,
    );
    expect(roles).toEqual([
      'heading',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'lyric',
      'character',
      'dialogue',
      'transition',
    ]);
  });

  test('a file exports to the same text, with each forced element and each emphasis', () => {
    expect(toFountain(imported().doc)).toBe(FIXTURE);
  });

  test('a synopsis goes on its scene, and a page break and a centered line keep their words', () => {
    const { source } = imported('INT. HALL - DAY\n= They meet.\n\n===\n\n>THE END<\n');
    const [scene] = source.nodes;
    expect(scene?.synopsis).toBe('They meet.');
    expect(scene?.text?.poem).toBe('INT. HALL - DAY\nTHE END\n');
  });

  test('lines before the first scene heading go in a scene of their own', () => {
    const { source } = imported('FADE IN:\n\nINT. HALL - DAY\n');
    expect(source.nodes.map((n) => n.title)).toEqual(['Opening', 'INT. HALL - DAY']);
  });

  test('a script with other formats gets a notice', () => {
    const { doc } = imported();
    expect(exportNotices(doc, 'fountain')).toEqual([]);
    const run = doc.sections[2]?.blocks[1];
    if (run?.type === 'paragraph' && run.runs[0]?.type === 'text') run.runs[0].style.color = '#aa0000';
    expect(exportNotices(doc, 'fdx')).toEqual([
      'A Final Draft file keeps bold, italic and underline. Words with other formats keep only their text.',
    ]);
  });
});

describe('Final Draft', () => {
  test('the file is XML with one Paragraph for each line and the right Type', () => {
    const xml = new DOMParser().parseFromString(toFdx(imported().doc), 'application/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    const paragraphs = [...xml.querySelectorAll('Content > Paragraph')];
    expect(paragraphs.slice(0, 9).map((p) => p.getAttribute('Type'))).toEqual([
      'Scene Heading',
      'Action',
      'Character',
      'Parenthetical',
      'Dialogue',
      'Dialogue',
      'Character',
      'Dialogue',
      'Transition',
    ]);
    expect(paragraphs).toHaveLength(15);
    // Folder titles are not script text, so they stay out.
    expect(xml.documentElement.textContent).not.toContain('Act One');
    const styled = [...(paragraphs[1]?.querySelectorAll('Text') ?? [])].map((t) => [
      t.textContent,
      t.getAttribute('Style'),
    ]);
    expect(styled).toContainEqual(['black', 'Italic']);
    expect(styled).toContainEqual(['loud', 'Bold']);
    expect(styled).toContainEqual(['slow', 'Underline']);
    // A lyric is dialogue in italics.
    expect(paragraphs[5]?.querySelector('Text')?.getAttribute('Style')).toBe('Italic');
  });
});

describe('Table read of a script (F58)', () => {
  const mara: CodexEntry = {
    id: 'mara',
    projectId: 'p',
    kind: 'character',
    name: 'Mara',
    aliases: [],
    order: 'a',
  };

  test('a character line names the speaker with no guess, and no one reads the cue', () => {
    expect(cueSpeaker('MARA (V.O.)', [mara])).toBe('mara');
    const doc = editorSchemas.script.nodeFromJSON({
      type: 'doc',
      content: [
        ['action', 'Jonah waits.'],
        ['character', 'MARA'],
        ['parenthetical', '(quietly)'],
        ['dialogue', 'We left at dawn.'],
        ['action', 'She goes.'],
      ].map(([role, text]) => ({ type: 'scriptLine', attrs: { role }, content: [{ type: 'text', text }] })),
    });
    const said = castSentences(
      doc,
      () => [],
      (speaker) => speaker ?? 'narrator',
      (cue) => cueSpeaker(cue, [mara]),
    );
    expect(said.map((s) => [s.text, s.voice])).toEqual([
      ['Jonah waits.', 'narrator'],
      ['(quietly)', 'narrator'],
      ['We left at dawn.', 'mara'],
      ['She goes.', 'narrator'],
    ]);
  });
});
