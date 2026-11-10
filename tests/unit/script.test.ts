import { Editor } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { backUpProject, importBackup, readBackup } from '@/features/backup/backup';
import { resetCodex, setCodexEntries } from '@/features/codex/codexStore';
import { scriptExtensions } from '@/features/editor/extensions/script';
import { docText } from '@/features/editor/itemText';
import { nextRole, type ScriptRole } from '@/features/editor/scriptRoles';
import { itemBlocks, noteCounter, updateToJson } from '@/features/export/read';
import { editorSchemas } from '@/features/import/tree';
import { createProject } from '@/features/library/projects';
import { projectDef } from '@/features/library/templates';
import { db } from '@/lib/db';
import { readItemUpdate, writeItemUpdate, YFRAGMENT } from '@/lib/ydocs';
import { scriptUpdate } from './export-fixtures';

/* Roadmap 2 F63, plan Task M2: the script editor. Review Focus 2: a script line never loses its role. */

const SCENE: readonly (readonly [ScriptRole, string])[] = [
  ['heading', 'int. kitchen - night'],
  ['action', 'Rain on the window.'],
  ['character', 'Alice'],
  ['parenthetical', '(quietly)'],
  ['dialogue', 'We left at dawn.'],
  ['transition', 'cut to:'],
];

const roles = (doc: { forEach: (f: (node: { attrs: Record<string, unknown> }) => void) => void }) => {
  const out: unknown[] = [];
  doc.forEach((node) => out.push(node.attrs.role));
  return out;
};

describe('Tab and Enter', () => {
  test('Enter starts the element that usually follows', () => {
    expect(nextRole('heading', 'Enter')).toBe('action');
    expect(nextRole('action', 'Enter')).toBe('action');
    expect(nextRole('character', 'Enter')).toBe('dialogue');
    expect(nextRole('parenthetical', 'Enter')).toBe('dialogue');
    expect(nextRole('dialogue', 'Enter')).toBe('action');
    expect(nextRole('transition', 'Enter')).toBe('heading');
  });

  test('Tab moves through action, character, transition and heading, and between dialogue and parenthetical', () => {
    expect(nextRole('action', 'Tab')).toBe('character');
    expect(nextRole('character', 'Tab')).toBe('transition');
    expect(nextRole('transition', 'Tab')).toBe('heading');
    expect(nextRole('heading', 'Tab')).toBe('action');
    expect(nextRole('dialogue', 'Tab')).toBe('parenthetical');
    expect(nextRole('parenthetical', 'Tab')).toBe('dialogue');
  });
});

describe('The script editor', () => {
  let editor: Editor;

  beforeEach(() => {
    const host = document.createElement('div');
    document.body.append(host);
    editor = new Editor({ element: host, extensions: scriptExtensions(new Y.Doc()) });
    editor.commands.focus('end');
  });
  afterEach(() => {
    editor.destroy();
    resetCodex();
    document.body.replaceChildren();
  });

  const press = (key: string) => {
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };
  const lines = () => {
    const out: [unknown, string][] = [];
    editor.state.doc.forEach((line) => out.push([line.attrs.role, line.textContent]));
    return out;
  };

  test('Tab changes the role of the line, and Enter at the end starts the next role', () => {
    editor.commands.setScriptRole('heading');
    editor.commands.insertContent('INT. KITCHEN - NIGHT');
    press('Enter');
    editor.commands.insertContent('Rain.');
    press('Enter');
    press('Tab');
    editor.commands.insertContent('ALICE');
    press('Enter');
    editor.commands.insertContent('Hello.');
    expect(lines()).toEqual([
      ['heading', 'INT. KITCHEN - NIGHT'],
      ['action', 'Rain.'],
      ['character', 'ALICE'],
      ['dialogue', 'Hello.'],
    ]);
  });

  test('Enter in the middle of a line keeps the role on both halves', () => {
    editor.commands.setScriptRole('dialogue');
    editor.commands.insertContent('We left. At dawn.');
    editor.commands.setTextSelection(10);
    press('Enter');
    expect(lines()).toEqual([
      ['dialogue', 'We left. '],
      ['dialogue', 'At dawn.'],
    ]);
  });

  test('a character line offers the Codex name, and Enter takes it as the Codex writes it', () => {
    setCodexEntries('p1', [
      { id: 'c1', projectId: 'p1', kind: 'place', name: 'Albany', aliases: [], order: 'a' },
      { id: 'c2', projectId: 'p1', kind: 'character', name: 'Alice Moss', aliases: [], order: 'b' },
    ]);
    editor.commands.setScriptRole('character');
    editor.commands.insertContent('al');
    expect(editor.view.dom.querySelector('.vlo-script-ghost')?.textContent).toBe('ice Moss');
    press('Enter');
    expect(lines()).toEqual([
      ['character', 'Alice Moss'],
      ['dialogue', ''],
    ]);
    expect(editor.view.dom.querySelector('.vlo-script-ghost')).toBeNull();
  });

  test('an action line offers no name', () => {
    setCodexEntries('p1', [
      { id: 'c2', projectId: 'p1', kind: 'character', name: 'Alice', aliases: [], order: 'b' },
    ]);
    editor.commands.insertContent('Al');
    expect(editor.view.dom.querySelector('.vlo-script-ghost')).toBeNull();
  });
});

describe('A role survives', () => {
  beforeEach(async () => {
    await db.open();
  });
  afterEach(async () => {
    await db.delete();
  });

  test('a save and a reload, a sync merge and the export tree', () => {
    const update = scriptUpdate(SCENE);
    // Another device's copy merges in as a sync does.
    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    const node = yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(YFRAGMENT), editorSchemas.script);
    expect(roles(node)).toEqual(SCENE.map(([role]) => role));
    expect(docText(node, 'script')).toContain('We left at dawn.');

    const blocks = itemBlocks(updateToJson(update), 'script', noteCounter());
    expect(blocks.map((b) => (b.type === 'paragraph' ? b.role : null))).toEqual(SCENE.map(([role]) => role));
    // A heading, a character and a transition are in capitals in each export.
    const texts = blocks.map((b) =>
      b.type === 'paragraph' && b.runs[0]?.type === 'text' ? b.runs[0].text : '',
    );
    expect(texts).toEqual([
      'INT. KITCHEN - NIGHT',
      'Rain on the window.',
      'ALICE',
      '(quietly)',
      'We left at dawn.',
      'CUT TO:',
    ]);
  });

  test('a backup and its import', async () => {
    const { project } = await createProject({ title: 'Night Ferry', templates: ['script'] });
    const [scene] = await db.items.where('projectId').equals(project.id).toArray();
    expect(scene?.kind).toBe('script');
    expect(projectDef(project).editorKind('script')).toBe('script');
    await writeItemUpdate(scene?.id ?? '', scriptUpdate(SCENE), 1);
    await db.projects.update(project.id, { 'settings.scriptStyle': 'stage' });

    const backup = await readBackup((await backUpProject(project.id, { music: false })).bytes);
    const copyId = await importBackup(backup, 'copy');
    const [copy] = await db.items.where('projectId').equals(copyId).toArray();
    expect(copy?.kind).toBe('script');
    expect((await db.projects.get(copyId))?.settings.scriptStyle).toBe('stage');
    const json = updateToJson(await readItemUpdate(copy?.id ?? ''));
    expect(json.content?.map((line): unknown => line.attrs?.role)).toEqual(SCENE.map(([role]) => role));
  });
});
