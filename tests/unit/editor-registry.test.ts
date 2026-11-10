import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { ariaShortcut, shortcutLabel } from '@/features/editor/commands/keys';
import { COMMANDS, command, commandsFor, matchesCommand } from '@/features/editor/commands/registry';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { parsePoemText, poemDataToJSON } from '@/features/editor/poemText';

let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  editor = undefined;
  document.body.replaceChildren();
});

function mount(kind: 'prose' | 'poem'): Editor {
  const host = document.createElement('div');
  document.body.append(host);
  const doc = new Y.Doc();
  editor = new Editor({
    element: host,
    extensions: kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc),
  });
  if (kind === 'poem') editor.commands.setContent(poemDataToJSON(parsePoemText('  Salt on the sill\n')));
  else editor.commands.setContent('<p>The harbour lights</p>');
  return editor;
}

/** Sends a TipTap shortcut such as "Mod-Shift-s" to the editor. jsdom is not a Mac, so Mod is Control. */
function pressKeys(target: Editor, keys: string) {
  const parts = keys.split(/-(?!$)/);
  const key = parts.pop() ?? '';
  target.view.dom.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      ctrlKey: parts.includes('Mod'),
      shiftKey: parts.includes('Shift'),
      altKey: parts.includes('Alt'),
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe('the command registry', () => {
  test('every id is unique', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('no two tools in one form share a shortcut, and Mod-K stays with the command menu', () => {
    for (const form of ['prose', 'poem'] as const) {
      const keys = commandsFor(form).flatMap((c) => (c.keys ? [c.keys.toLowerCase()] : []));
      expect(new Set(keys).size, form).toBe(keys.length);
      expect(keys).not.toContain('mod-k');
    }
  });

  test('every tool names its forms, and poems get no block tool', () => {
    for (const cmd of COMMANDS) expect(cmd.forms.length, cmd.id).toBeGreaterThan(0);
    const poemGroups = new Set(commandsFor('poem').map((c) => c.group));
    for (const group of ['block', 'align', 'paragraph'] as const) expect(poemGroups.has(group)).toBe(false);
    expect(commandsFor('poem').map((c) => c.id)).not.toContain('link');
  });

  test('command() throws for an unknown id, so a typo fails here and not for a writer', () => {
    expect(() => command('bold')).not.toThrow();
    expect(() => command('blod')).toThrow(/No editor command/);
  });

  test('a search finds tools by label and keyword, with every word', () => {
    const find = (q: string) => COMMANDS.filter((c) => matchesCommand(c, q)).map((c) => c.id);
    expect(find('head')).toEqual(['role-heading', 'heading-2', 'heading-3']);
    expect(find('double spacing')).toEqual(['spacing']);
    expect(find('raised')).toEqual(['superscript']);
    expect(find('')).toHaveLength(COMMANDS.length);
  });

  test.each(['prose', 'poem'] as const)(
    'each run tool acts on %s text, and its shortcut does the same',
    (form) => {
      const e = mount(form);
      for (const cmd of commandsFor(form)) {
        if (cmd.kind !== 'run' || !cmd.isActive || cmd.group !== 'style') continue;
        e.commands.selectAll();
        expect(cmd.isActive(e), `${cmd.id} starts off`).toBe(false);
        expect(cmd.run(e), cmd.id).toBe(true);
        expect(cmd.isActive(e), `${cmd.id} by button`).toBe(true);
        cmd.run(e);
        expect(cmd.isActive(e), `${cmd.id} off again`).toBe(false);
        if (!cmd.keys) continue;
        pressKeys(e, cmd.keys);
        expect(cmd.isActive(e), `${cmd.id} by ${cmd.keys}`).toBe(true);
        cmd.run(e);
      }
    },
  );

  test('block shortcuts in the registry are bound in prose', () => {
    const e = mount('prose');
    for (const id of [
      'heading-2',
      'heading-3',
      'quote',
      'bullets',
      'numbers',
      'align-center',
      'align-justify',
    ]) {
      const cmd = command(id);
      e.commands.setContent('<p>The harbour lights</p>');
      e.commands.setTextSelection(3);
      expect(cmd.keys, id).toBeDefined();
      pressKeys(e, cmd.keys ?? '');
      expect(cmd.isActive?.(e), `${id} by ${cmd.keys ?? ''}`).toBe(true);
    }
  });

  test('Mod-Shift-H marks the selection with the yellow swatch', () => {
    const e = mount('prose');
    e.commands.selectAll();
    pressKeys(e, 'Mod-Shift-h');
    expect(command('highlight-yellow').isActive?.(e)).toBe(true);
    expect(e.getHTML()).toContain('var(--vlo-mark-yellow)');
  });
});

describe('shortcut labels', () => {
  test('read as symbols on Apple devices and as words elsewhere', () => {
    expect(shortcutLabel('Mod-Shift-h', true)).toBe('⌘⇧H');
    expect(shortcutLabel('Mod-Shift-h', false)).toBe('Ctrl+Shift+H');
    expect(shortcutLabel('Mod-Alt-2', false)).toBe('Ctrl+Alt+2');
    expect(shortcutLabel('Mod-.', false)).toBe('Ctrl+.');
    expect(shortcutLabel('Mod-\\', true)).toBe('⌘\\');
  });

  test('give aria-keyshortcuts both Control and Meta for Mod', () => {
    expect(ariaShortcut('Mod-b')).toBe('Control+B Meta+B');
    expect(ariaShortcut('Mod-Shift-8')).toBe('Control+Shift+8 Meta+Shift+8');
    expect(ariaShortcut('Alt-F10')).toBe('Alt+F10');
  });
});
