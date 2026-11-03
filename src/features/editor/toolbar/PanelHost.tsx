import type { Editor } from '@tiptap/core';
import { X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/popover';
import {
  focusText,
  closePanel,
  getPanelRequest,
  usePanelRequest,
  type PanelAnchor,
} from '../commands/editorBus';
import type { EditorForm, PanelId } from '../commands/registry';
import { heldKey } from '../extensions/editorTools';
import { ColorPanel } from './panels/ColorPanel';
import { LinkPanel } from './panels/LinkPanel';
import { SizePanel } from './panels/SizePanel';
import { SpacingPanel } from './panels/SpacingPanel';
import { ShortcutSheet } from './ShortcutSheet';

/** A rectangle at the selection start, for panels opened from the / menu or the command menu. */
function caretRect(editor: Editor): DOMRect {
  const { from, to } = editor.state.selection;
  try {
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    const top = Math.min(start.top, end.top);
    const bottom = Math.max(start.bottom, end.bottom);
    const left = start.top === end.top ? Math.min(start.left, end.left) : start.left;
    const right = start.top === end.top ? Math.max(start.right, end.right) : start.left + 1;
    return new DOMRect(left, top, Math.max(right - left, 1), bottom - top);
  } catch {
    return editor.view.dom.getBoundingClientRect();
  }
}

function measurable(editor: Editor, anchor: PanelAnchor) {
  return {
    current: {
      getBoundingClientRect: () =>
        anchor === 'caret' || !anchor.isConnected ? caretRect(editor) : anchor.getBoundingClientRect(),
    },
  };
}

function PanelBody({ editor, panel }: { editor: Editor; panel: PanelId }) {
  switch (panel) {
    case 'shortcuts':
      return null;
    case 'color':
      return <ColorPanel editor={editor} kind="text" />;
    case 'highlight':
      return <ColorPanel editor={editor} kind="mark" />;
    case 'size':
      return <SizePanel editor={editor} />;
    case 'spacing':
      return <SpacingPanel editor={editor} />;
    case 'link':
      return <LinkPanel editor={editor} onDone={closePanel} />;
  }
}

const PANEL_NAMES: Readonly<Record<PanelId, string>> = {
  shortcuts: 'Keyboard shortcuts',
  color: 'Font color',
  highlight: 'Highlight',
  size: 'Font size',
  spacing: 'Line spacing',
  link: 'Link',
};

/** Shows the panel any tool surface asked for: a popover at its button or the caret, or the shortcut sheet. */
export function PanelHost({ editor, form }: { editor: Editor; form: EditorForm }) {
  const request = usePanelRequest();
  const mine = request?.editor === editor ? request : null;
  const popover = mine && mine.panel !== 'shortcuts' ? mine : null;
  const anchor = useMemo(() => (popover ? measurable(editor, popover.anchor) : null), [editor, popover]);

  // The selected text stays marked while the panel has focus, so the writer sees what the panel changes.
  useEffect(() => {
    if (!popover || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(heldKey, { hold: true }));
    return () => {
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(heldKey, { release: true }));
    };
  }, [editor, popover]);

  // The panel closes with its editor.
  useEffect(
    () => () => {
      if (getPanelRequest()?.editor === editor) closePanel();
    },
    [editor],
  );

  const backToText = (event: Event) => {
    event.preventDefault();
    focusText(editor);
  };
  // A click elsewhere keeps the focus it gave. Only focus that has nowhere to go returns to the text.
  const backIfLost = (event: Event) => {
    event.preventDefault();
    const active = document.activeElement;
    if (!active || active === document.body) focusText(editor);
  };

  return (
    <>
      <Popover
        open={popover !== null}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
      >
        {anchor && <PopoverAnchor virtualRef={anchor} />}
        {popover && (
          <PopoverContent
            aria-label={PANEL_NAMES[popover.panel]}
            side="bottom"
            align="start"
            onCloseAutoFocus={backIfLost}
            onEscapeKeyDown={() => {
              // Back to the text at once, so keys typed during the closing fade reach it.
              focusText(editor);
            }}
          >
            <PanelBody editor={editor} panel={popover.panel} />
          </PopoverContent>
        )}
      </Popover>
      <Dialog
        open={mine?.panel === 'shortcuts'}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
      >
        {mine?.panel === 'shortcuts' && (
          <DialogContent className="max-w-xl" onCloseAutoFocus={backToText}>
            <DialogClose asChild>
              <Button variant="ghost" aria-label="Close shortcuts" className="absolute top-4 right-4 px-3">
                <X aria-hidden="true" className="size-4" />
              </Button>
            </DialogClose>
            <div className="grid gap-1 pr-10">
              <DialogTitle>Keyboard shortcuts</DialogTitle>
              <DialogDescription>These keys work while the cursor is in the text.</DialogDescription>
            </div>
            <ShortcutSheet form={form} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
