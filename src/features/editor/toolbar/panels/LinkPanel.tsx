import type { Editor } from '@tiptap/core';
import { useId, useState } from 'react';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';

/** Adds https:// to an address such as "example.com", so the link works when clicked. */
export function normalizeHref(raw: string): string {
  const value = raw.trim();
  if (value === '' || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('#')) return value;
  return `https://${value}`;
}

const SAFE = /^(https?:|mailto:|tel:|#)/i;

/** Adds, changes or removes the link on the selection. */
export function LinkPanel({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const current = String(editor.getAttributes('link').href ?? '');
  const [value, setValue] = useState(current);
  const [error, setError] = useState('');
  const id = useId();

  const remove = () => {
    editor.chain().extendMarkRange('link').unsetLink().run();
    onDone();
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const href = normalizeHref(value);
        if (href === '') {
          remove();
          return;
        }
        if (!SAFE.test(href)) {
          setError('Use an address that starts with https://, http:// or mailto:.');
          return;
        }
        const { empty } = editor.state.selection;
        const chain = editor.chain().extendMarkRange('link');
        if (empty && !editor.isActive('link')) {
          // No text is selected, so the address becomes the link text.
          chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
        } else {
          chain.setLink({ href }).run();
        }
        onDone();
      }}
    >
      <h2 className="text-sm font-medium">Link</h2>
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Address</Label>
        <Input
          id={id}
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="https://"
          value={value}
          aria-invalid={error !== '' || undefined}
          aria-describedby={error ? `${id}-error` : `${id}-help`}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
        />
        {error ? (
          <p id={`${id}-error`} className="text-xs text-accent-text">
            {error}
          </p>
        ) : (
          <p id={`${id}-help`} className="text-xs text-muted">
            Leave the address empty to remove the link.
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {current !== '' && (
          <Button type="button" variant="ghost" onClick={remove}>
            Remove link
          </Button>
        )}
        {/^(https?|mailto):/i.test(current) && (
          <Button asChild variant="ghost">
            <a href={current} target="_blank" rel="noreferrer">
              Open link
            </a>
          </Button>
        )}
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
