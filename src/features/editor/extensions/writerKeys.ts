import { Extension } from '@tiptap/core';
import { keydownHandler } from '@tiptap/pm/keymap';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Template } from '@/lib/db';
import { runCommand } from '../commands/editorBus';
import { findCommand, offeredIn, type EditorForm } from '../commands/registry';
import { getWriterTools, onWriterTools } from '../writerTools';

/*
 * The writer's own keys (Phase 19, Task E1). This plugin runs before every other key of the editor. A new
 * key runs its tool. The old key of a changed tool does nothing, so it never runs the tool that the writer
 * moved away from it. The other keys go on to the extensions that own them.
 */

export interface WriterKeysOptions {
  form: EditorForm;
  templates: readonly Template[] | undefined;
}

type Handler = (view: EditorView, event: KeyboardEvent) => boolean;

const writerKeysKey = new PluginKey('writerKeys');

export const WriterKeys = Extension.create<WriterKeysOptions>({
  name: 'writerKeys',
  priority: 10_000,

  addOptions() {
    return { form: 'prose', templates: undefined };
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    const { form, templates } = this.options;
    const build = (): Handler => {
      const bindings: Record<string, () => boolean> = {};
      const own = Object.entries(getWriterTools().keys);
      for (const [id, keys] of own) {
        const cmd = findCommand(id);
        if (cmd?.keys && cmd.keys !== keys) bindings[cmd.keys] = () => true;
      }
      for (const [id, keys] of own) {
        const cmd = findCommand(id);
        if (cmd && keys !== '' && cmd.forms.includes(form) && offeredIn(cmd, templates))
          bindings[keys] = () => runCommand(editor, cmd);
      }
      return keydownHandler(bindings);
    };
    let handler = build();
    return [
      new Plugin({
        key: writerKeysKey,
        props: { handleKeyDown: (view, event) => handler(view, event) },
        view: () => {
          const stop = onWriterTools(() => {
            handler = build();
          });
          return { destroy: stop };
        },
      }),
    ];
  },
});
