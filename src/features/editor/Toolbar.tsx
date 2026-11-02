import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
  type LucideIcon,
} from 'lucide-react';
import { Toolbar as ToolbarPrimitive } from 'radix-ui';
import { useId, useState } from 'react';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { MAX_HANGING_EM } from './extensions/poem';

const itemClass =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text aria-pressed:bg-surface aria-pressed:text-accent-text disabled:opacity-40';

function Toggle({
  label,
  icon: Icon,
  pressed,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <ToolbarPrimitive.Button
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={itemClass}
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-4" />
    </ToolbarPrimitive.Button>
  );
}

/** The formatting toolbar. Arrow keys move inside it, so it is one Tab stop. */
export function Toolbar({ editor, kind }: { editor: Editor; kind: 'prose' | 'poem' }) {
  // Reads only what the buttons show, so typing does not re-render the toolbar unless a state changes.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      quote: e.isActive('blockquote'),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      hanging: Number(e.getAttributes('poemLine').hanging) || 0,
      href: String(e.getAttributes('link').href ?? ''),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  // Said only after a hanging indent button press. A caret move changes the readout but says nothing.
  const [hangMessage, setHangMessage] = useState('');
  const hang = (next: number) => () => {
    if (editor.chain().focus().setHanging(next).run()) {
      setHangMessage(`Hanging indent ${String(Math.min(Math.max(next, 0), MAX_HANGING_EM))} em.`);
    }
  };
  const run = (fn: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => () => {
    fn(editor.chain().focus()).run();
  };

  return (
    <>
      <ToolbarPrimitive.Root
        aria-label="Formatting"
        className="flex flex-wrap items-center gap-0.5 border-b border-rule pb-2"
      >
        <Toggle label="Bold" icon={Bold} pressed={state.bold} onClick={run((c) => c.toggleBold())} />
        <Toggle label="Italic" icon={Italic} pressed={state.italic} onClick={run((c) => c.toggleItalic())} />
        <Toggle
          label="Underline"
          icon={Underline}
          pressed={state.underline}
          onClick={run((c) => c.toggleUnderline())}
        />
        <Toggle
          label="Strikethrough"
          icon={Strikethrough}
          pressed={state.strike}
          onClick={run((c) => c.toggleStrike())}
        />
        <ToolbarPrimitive.Separator className="mx-1 h-6 w-px bg-rule" />
        {kind === 'prose' ? (
          <>
            <Toggle
              label="Link"
              icon={LinkIcon}
              pressed={state.link}
              onClick={() => {
                setLinkOpen(true);
              }}
            />
            <Toggle
              label="Heading 2"
              icon={Heading2}
              pressed={state.h2}
              onClick={run((c) => c.toggleHeading({ level: 2 }))}
            />
            <Toggle
              label="Heading 3"
              icon={Heading3}
              pressed={state.h3}
              onClick={run((c) => c.toggleHeading({ level: 3 }))}
            />
            <Toggle
              label="Quote"
              icon={Quote}
              pressed={state.quote}
              onClick={run((c) => c.toggleBlockquote())}
            />
            <Toggle
              label="Bulleted list"
              icon={List}
              pressed={state.bullets}
              onClick={run((c) => c.toggleBulletList())}
            />
            <Toggle
              label="Numbered list"
              icon={ListOrdered}
              pressed={state.numbers}
              onClick={run((c) => c.toggleOrderedList())}
            />
            <ToolbarPrimitive.Button
              className={`${itemClass} w-auto px-3 font-manuscript text-base`}
              onClick={run((c) => c.insertSceneBreak())}
            >
              <span aria-hidden="true">#</span>
              <span className="sr-only">Scene break</span>
            </ToolbarPrimitive.Button>
          </>
        ) : (
          <>
            <ToolbarPrimitive.Button
              aria-label="Less hanging indent"
              title="Less hanging indent"
              className={itemClass}
              disabled={state.hanging <= 0}
              onClick={hang(state.hanging - 1)}
            >
              <IndentDecrease aria-hidden="true" className="size-4" />
            </ToolbarPrimitive.Button>
            <span className="min-w-20 text-center font-mono text-xs text-muted">Hang {state.hanging} em</span>
            <ToolbarPrimitive.Button
              aria-label="More hanging indent"
              title="More hanging indent"
              className={itemClass}
              disabled={state.hanging >= MAX_HANGING_EM}
              onClick={hang(state.hanging + 1)}
            >
              <IndentIncrease aria-hidden="true" className="size-4" />
            </ToolbarPrimitive.Button>
          </>
        )}
      </ToolbarPrimitive.Root>
      {kind === 'poem' && (
        <p role="status" className="sr-only">
          {hangMessage}
        </p>
      )}
      {kind === 'prose' && (
        <LinkDialog
          open={linkOpen}
          href={state.href}
          onOpenChange={setLinkOpen}
          onSave={(href) => {
            const chain = editor.chain().focus().extendMarkRange('link');
            (href === '' ? chain.unsetLink() : chain.setLink({ href })).run();
            setLinkOpen(false);
          }}
        />
      )}
    </>
  );
}

function LinkDialog({
  open,
  href,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  href: string;
  onOpenChange: (open: boolean) => void;
  onSave: (href: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent>
          <LinkForm href={href} onSave={onSave} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function LinkForm({ href, onSave }: { href: string; onSave: (href: string) => void }) {
  const [value, setValue] = useState(href);
  const id = useId();
  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value.trim());
      }}
    >
      <div className="grid gap-2">
        <DialogTitle>Link</DialogTitle>
        <DialogDescription>Leave the address empty to remove the link.</DialogDescription>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={id}>Address</Label>
        <Input
          id={id}
          type="url"
          inputMode="url"
          placeholder="https://"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
