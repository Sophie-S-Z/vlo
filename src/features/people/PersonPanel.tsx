import { getMarkRange, type Editor } from '@tiptap/core';
import { useId, useState } from 'react';
import { useNames } from './nameStore';
import { addPerson } from './people';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';

/*
 * "Mark as person" (spec 8.2, plan Task C5). The writer picks the person that the selected text names,
 * or adds a person with the selected text as a real name and an alias for it.
 */

function selectedText(editor: Editor): string {
  const { from, to, empty, $from } = editor.state.selection;
  if (!empty) return editor.state.doc.textBetween(from, to, ' ');
  // With no selection, the panel works on the marked name at the cursor.
  const type = editor.schema.marks.privateName;
  const range = type ? getMarkRange($from, type) : undefined;
  return range ? editor.state.doc.textBetween(range.from, range.to, ' ') : '';
}

export function PersonPanel({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const { people, projectId } = useNames();
  const [text] = useState(() => selectedText(editor));
  const current = String(editor.getAttributes('privateName').personId ?? '');
  const named = people.find((p) => p.variants.some((v) => v.real === text.trim()));
  const [choice, setChoice] = useState(current !== '' ? current : (named?.id ?? people[0]?.id ?? ''));
  const [real, setReal] = useState(text.trim());
  const [alias, setAlias] = useState('');
  const [error, setError] = useState('');
  const id = useId();

  const mark = (personId: string) => {
    editor.chain().focus().extendMarkRange('privateName').setPrivateName(personId).run();
    onDone();
  };

  const remove = () => {
    editor.chain().focus().unsetPrivateName().run();
    onDone();
  };

  const add = async () => {
    if (projectId === null) return;
    try {
      const person = await addPerson(projectId, '', [{ real, alias }]);
      mark(person.id);
    } catch (problem) {
      setError(
        problem instanceof RangeError ? problem.message : 'Vlo could not save the person on this device.',
      );
    }
  };

  return (
    <div className="grid w-[min(20rem,calc(100vw-1.5rem))] gap-4">
      <div className="grid gap-1">
        <h2 className="text-sm font-medium">Mark as person</h2>
        <p className="text-sm text-muted [overflow-wrap:anywhere]">
          Share-safe exports show the person&apos;s alias in place of “{text.trim()}”.
        </p>
      </div>

      {people.length > 0 && (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (choice !== '') mark(choice);
          }}
        >
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">Person</legend>
            <RadioGroup
              aria-label="Person"
              value={choice}
              onValueChange={setChoice}
              className="max-h-48 overflow-y-auto"
            >
              {people.map((person) => (
                <label key={person.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <RadioGroupItem value={person.id} />
                  <span className="[overflow-wrap:anywhere]">
                    {person.label}
                    <span className="text-muted"> as {person.variants[0]?.alias ?? ''}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2">
            {current !== '' && (
              <Button type="button" variant="ghost" onClick={remove}>
                Remove the mark
              </Button>
            )}
            <Button type="submit">Mark</Button>
          </div>
        </form>
      )}

      <form
        className="grid gap-3 border-t border-rule pt-3 first:border-t-0 first:pt-0"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <h3 className="text-sm font-medium">{people.length > 0 ? 'Or add a person' : 'Add a person'}</h3>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-real`}>Real name</Label>
          <Input
            id={`${id}-real`}
            value={real}
            maxLength={80}
            onChange={(event) => {
              setReal(event.target.value);
              setError('');
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-alias`}>Alias</Label>
          <Input
            id={`${id}-alias`}
            value={alias}
            maxLength={80}
            aria-invalid={error !== '' || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setAlias(event.target.value);
              setError('');
            }}
          />
          {error && (
            <p id={`${id}-error`} role="alert" className="text-xs text-accent-text">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant={people.length > 0 ? 'outline' : 'primary'}>
            Add and mark
          </Button>
        </div>
      </form>
    </div>
  );
}
