import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { eventKeys, normalKeys, sameKeys } from '@/features/editor/commands/keys';
import { COMMANDS, command, keysOf } from '@/features/editor/commands/registry';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { WriterKeys } from '@/features/editor/extensions/writerKeys';
import { withOrder } from '@/features/editor/toolbar/CustomizeToolbar';
import { pinnableTools, pinnedSegments } from '@/features/editor/toolbar/toolbarLayout';
import {
  cleanWriterTools,
  getWriterTools,
  setWriterTools,
  takeWriterTools,
} from '@/features/editor/writerTools';

/* Phase 19, Task E1: the writer's toolbar and keys. */

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  setWriterTools({ toolbar: null, keys: {} });
});

describe('the stored toolbar and keys', () => {
  test('keep good ids and keys, and drop the rest', () => {
    expect(
      cleanWriterTools({
        toolbar: ['bold', 'bold', 'Not an id', 7, 'italic'],
        keys: { bold: 'Mod-Shift-b', italic: '', strike: 'no key', 'heading-2': 'Mod-Alt-ArrowUp' },
        updatedAt: 5,
      }),
    ).toEqual({
      toolbar: ['bold', 'italic'],
      keys: { bold: 'Mod-Shift-b', italic: '', 'heading-2': 'Mod-Alt-ArrowUp' },
      updatedAt: 5,
    });
    expect(cleanWriterTools('damaged')).toEqual({ toolbar: null, keys: {}, updatedAt: 0 });
  });

  test('a copy from another device wins only when it is newer', () => {
    setWriterTools({ toolbar: ['bold'] });
    const at = getWriterTools().updatedAt;
    expect(takeWriterTools({ toolbar: ['italic'], keys: {}, updatedAt: at - 1 })).toBe(false);
    expect(getWriterTools().toolbar).toEqual(['bold']);
    expect(takeWriterTools({ toolbar: ['italic'], keys: {}, updatedAt: at + 1 })).toBe(true);
    expect(getWriterTools().toolbar).toEqual(['italic']);
  });
});

describe('the pinned toolbar', () => {
  test('a form offers only its own tools to pin', () => {
    expect(pinnableTools('prose')).toContain('heading-2');
    expect(pinnableTools('poem')).not.toContain('link');
    expect(pinnableTools('script')).not.toContain('image');
  });

  test('groups the tools by kind, and a phone shows the first four', () => {
    const offered = new Set(pinnableTools('prose'));
    expect(pinnedSegments(['bold', 'italic', 'undo', 'image', 'math', 'heading-2'], offered)).toEqual([
      { tools: ['bold', 'italic'], wide: false },
      { tools: ['undo'], wide: false },
      { tools: ['image'], wide: false },
      { tools: ['math'], wide: true },
      { tools: ['heading-2'], wide: true },
    ]);
    // A tool that the form does not have takes no place.
    expect(pinnedSegments(['link', 'bold'], new Set(pinnableTools('poem')))).toEqual([
      { tools: ['bold'], wide: false },
    ]);
  });

  test('a new order of the shown tools keeps the places of the others', () => {
    expect(withOrder(['link', 'bold', 'image', 'italic'], ['italic', 'bold'])).toEqual([
      'link',
      'italic',
      'image',
      'bold',
    ]);
  });
});

describe('keys', () => {
  test('each of Vlo’s keys belongs to one tool', () => {
    const seen = new Map<string, string>();
    for (const cmd of new Map(COMMANDS.map((c) => [c.id, c])).values()) {
      if (!cmd.keys) continue;
      expect(seen.get(normalKeys(cmd.keys)), cmd.id).toBeUndefined();
      seen.set(normalKeys(cmd.keys), cmd.id);
    }
  });

  test('a key press gives a shortcut only with a modifier or an F key', () => {
    const press = (key: string, code: string, mods: Partial<KeyboardEvent> = {}) =>
      eventKeys(
        { key, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods },
        false,
      );
    expect(press('B', 'KeyB', { ctrlKey: true, shiftKey: true })).toBe('Mod-Shift-b');
    expect(press('*', 'Digit8', { ctrlKey: true, shiftKey: true })).toBe('Mod-Shift-8');
    expect(press('F7', 'F7', { shiftKey: true })).toBe('Shift-F7');
    expect(press('b', 'KeyB')).toBeNull();
    expect(press('Control', 'ControlLeft', { ctrlKey: true })).toBeNull();
    // On a Mac, Option changes the character, so the key's place names it.
    expect(
      eventKeys(
        { key: '∫', code: 'KeyB', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false },
        true,
      ),
    ).toBe('Mod-Alt-b');
    // On AZERTY the A key sits where QWERTY has Q. The editor reads the letter on the key, so the recorder does too.
    expect(press('a', 'KeyQ', { ctrlKey: true })).toBe('Mod-a');
    expect(sameKeys('Mod-Shift-B', 'Shift-Mod-b')).toBe(true);
  });

  test('a moved key runs its tool, and the old key does nothing', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new Editor({
      element,
      extensions: [...proseExtensions(new Y.Doc()), WriterKeys.configure({ form: 'prose', templates: [] })],
    });
    editors.push(editor);
    editor.commands.setContent('<p>Salt</p>');
    editor.commands.selectAll();
    const press = (key: string, shift = false) => {
      const event = new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey: shift, cancelable: true });
      editor.view.someProp('handleKeyDown', (handle) => handle(editor.view, event));
    };
    setWriterTools({ keys: { bold: 'Mod-Shift-x' } });
    expect(keysOf(command('bold'))).toBe('Mod-Shift-x');
    press('b');
    expect(editor.isActive('bold')).toBe(false);
    press('x', true);
    expect(editor.isActive('bold')).toBe(true);
    // A tool with no key keeps its menus, and its old key does nothing.
    setWriterTools({ keys: { italic: '' } });
    expect(keysOf(command('italic'))).toBeUndefined();
    press('i');
    expect(editor.isActive('italic')).toBe(false);
  });
});
