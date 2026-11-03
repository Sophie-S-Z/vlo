import type { Editor } from '@tiptap/core';
import { useSyncExternalStore } from 'react';
import type { EditorForm, EditorCommand, PanelId } from './registry';

/*
 * Two small stores the editor shares with the rest of the project screen: the editor that is open now,
 * so the command menu can run format commands, and the panel that is open, so any surface (toolbar,
 * selection menu, / menu, command menu) can open the same panel.
 */

export interface ActiveEditor {
  editor: Editor;
  form: EditorForm;
}

/** Where a panel sits: under a toolbar button, or at the caret. */
export type PanelAnchor = HTMLElement | 'caret';

export interface PanelRequest {
  editor: Editor;
  panel: PanelId;
  anchor: PanelAnchor;
}

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const active = createStore<ActiveEditor | null>(null);
const panel = createStore<PanelRequest | null>(null);

export function setActiveEditor(next: ActiveEditor | null): void {
  active.set(next);
}

export function getActiveEditor(): ActiveEditor | null {
  return active.get();
}

export function useActiveEditor(): ActiveEditor | null {
  return useSyncExternalStore(active.subscribe, active.get, active.get);
}

export function openPanel(request: PanelRequest): void {
  panel.set(request);
}

export function closePanel(): void {
  panel.set(null);
}

export function getPanelRequest(): PanelRequest | null {
  return panel.get();
}

export function usePanelRequest(): PanelRequest | null {
  return useSyncExternalStore(panel.subscribe, panel.get, panel.get);
}

/** Gives the text focus now. TipTap's own focus command waits a frame, and keys typed in that frame are lost. */
export function focusText(editor: Editor): void {
  if (!editor.isDestroyed && !editor.view.hasFocus()) editor.view.focus();
}

/** Runs a registry command from any surface. Run commands act at once; panel commands open their panel. */
export function runCommand(editor: Editor, cmd: EditorCommand, anchor: PanelAnchor = 'caret'): boolean {
  if (editor.isDestroyed) return false;
  if (cmd.kind === 'panel') {
    openPanel({ editor, panel: cmd.panel, anchor });
    return true;
  }
  focusText(editor);
  return cmd.run(editor);
}
