import type { Editor } from '@tiptap/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { formatWords } from '@/features/library/format';
import { useManuscript } from '@/features/editor/manuscript';
import { db, MAX_VERSION_NAME, type Item, type ItemVersion } from '@/lib/db';
import { countUnit, countWords } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import {
  activeName,
  compare,
  deleteVersion,
  renameVersion,
  saveVersion,
  switchVersion,
  takeBlock,
  undoDelete,
  VersionError,
  versionDoc,
  versionsOf,
} from './versions';
import type { EditorForm } from '@/features/library/templates';

/*
 * The Versions part of History (roadmap F55, plan Task K2). The writer keeps named versions of the item,
 * switches between them, and compares one with the text now, paragraph by paragraph.
 */

interface VersionsPanelProps {
  item: Item;
  kind: EditorForm;
  editor: Editor;
  doc: Y.Doc;
  /** Called after a switch, with a sentence for the writer. */
  onSwitched: (message: string) => void;
}

const formatTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const errorText = (error: unknown, fallback: string) =>
  error instanceof VersionError ? error.message : fallback;

/** One name field with Save and Cancel, for a new version or a rename. */
function NameForm({
  label,
  initial,
  submit,
  onCancel,
}: {
  label: string;
  initial: string;
  submit: (name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void submit(name).finally(() => {
          setBusy(false);
        });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <label htmlFor={id} className="grid gap-1 text-sm">
        {label}
        <Input
          id={id}
          value={name}
          maxLength={MAX_VERSION_NAME}
          onChange={(event) => {
            setName(event.target.value);
          }}
          className="w-64 max-w-full"
        />
      </label>
      <Button type="submit" variant="outline" disabled={busy}>
        Save
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </form>
  );
}

/** The paragraphs that differ between the text now and one version, each with "Use this". */
function Comparison({
  item,
  kind,
  editor,
  doc,
  version,
}: Omit<VersionsPanelProps, 'onSwitched'> & { version: ItemVersion }) {
  const headingId = useId();
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const onUpdate = () => {
      setTick((n) => n + 1);
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor]);
  const other = useMemo(() => versionDoc(editor, version.state), [editor, version.state]);
  // `tick` reads the editor again after each change, such as a "Use this".
  const result = useMemo(() => (tick >= 0 ? compare(editor.state.doc, other) : null), [editor, other, tick]);
  if (!result) return null;
  const differs = result.rows.filter((r) => r.kind !== 'same');
  const sameCount = result.rows.length - differs.length;
  const part = kind === 'poem' ? 'stanza' : 'paragraph';

  const take = (b: number) => {
    takeBlock(item, editor, doc, kind, version.state, b).then(
      () => {
        setMessage(`Took the ${part} from “${version.name}”. The text before it is saved as a snapshot.`);
      },
      () => {
        setMessage(`Vlo could not take that ${part}. Try again.`);
      },
    );
  };

  return (
    <section aria-labelledby={headingId} className="grid gap-3 border-t border-rule pt-4">
      <h3 id={headingId} className="font-display text-lg font-semibold">
        The text now and “{version.name}”
      </h3>
      <p className="text-sm text-muted">
        {differs.length === 0
          ? 'The two versions are the same.'
          : `${String(differs.length)} ${differs.length === 1 ? `${part} differs` : `${part}s differ`}. ${String(sameCount)} ${sameCount === 1 ? `${part} is` : `${part}s are`} the same.`}
      </p>
      <p role="status" className="text-sm text-muted">
        {message}
      </p>
      <ol className="grid gap-3">
        {differs.map((row) => (
          <li
            key={row.kind === 'onlyA' ? `a${String(row.a)}` : `b${String(row.b)}`}
            className="grid gap-2 rounded-md border border-rule p-3"
          >
            {row.kind !== 'onlyB' && (
              <div>
                <p className="text-xs text-muted">Now</p>
                <p className="font-manuscript whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {result.now[row.a] ?? ''}
                </p>
              </div>
            )}
            {row.kind !== 'onlyA' && (
              <div>
                <p className="text-xs text-muted">{version.name}</p>
                <p className="font-manuscript whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {result.other[row.b] ?? ''}
                </p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    take(row.b);
                  }}
                >
                  Use this
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function VersionsPanel({ item, kind, editor, doc, onSwitched }: VersionsPanelProps) {
  const versions = useLiveQuery(() => versionsOf(item.id), [item.id]);
  const fresh = useLiveQuery(() => db.items.get(item.id), [item.id]) ?? item;
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState<ItemVersion | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [comparing, setComparing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const language = useManuscript()?.language;
  const active = activeName(fresh);
  const compared = versions?.find((v) => v.id === comparing) ?? null;

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setDeleted(null);
    try {
      await action();
    } catch (error) {
      setMessage(errorText(error, fallback));
    } finally {
      setBusy(false);
    }
  };

  const doSwitch = (version: ItemVersion) =>
    run(async () => {
      await switchVersion(item, editor, doc, kind, version.id);
      onSwitched(`“${version.name}” is in the editor now. “${active}” is saved as a version.`);
    }, 'Vlo could not switch the version. Try again.');

  const doDelete = (version: ItemVersion) =>
    run(async () => {
      const row = await deleteVersion(version.id);
      if (comparing === version.id) setComparing(null);
      setMessage(`Deleted “${version.name}”.`);
      setDeleted(row ?? null);
    }, 'Vlo could not delete the version. Try again.');

  return (
    <div className="grid gap-5">
      {renaming === 'active' ? (
        <NameForm
          label="Name of the version in the editor"
          initial={active}
          submit={(name) =>
            run(async () => {
              await renameVersion(item.id, null, name);
              setRenaming(null);
            }, 'Vlo could not rename the version. Try again.')
          }
          onCancel={() => {
            setRenaming(null);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p>
            In the editor: <span className="font-medium">{active}</span>
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setRenaming('active');
            }}
          >
            Rename
          </Button>
        </div>
      )}

      <NameForm
        key={versions?.length ?? 0}
        label="Save the text now as a version named"
        initial=""
        submit={(name) =>
          run(async () => {
            const saved = await saveVersion(item, editor, doc, kind, name);
            setMessage(`Saved “${saved}”. The editor keeps the text.`);
          }, 'Vlo could not save the version. Try again.')
        }
      />

      <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {message}
        {deleted && (
          <Button
            variant="ghost"
            onClick={() => {
              void undoDelete(deleted).then(() => {
                setMessage(`“${deleted.name}” is back.`);
                setDeleted(null);
              });
            }}
          >
            Undo
          </Button>
        )}
      </div>

      {versions === undefined ? (
        <p className="text-muted">Loading versions.</p>
      ) : versions.length === 0 ? (
        <p className="text-muted">No other versions yet. Save one before you try a new direction.</p>
      ) : (
        <ul aria-label="Other versions" className="grid gap-2">
          {versions.map((version) => (
            <li key={version.id} className="grid gap-2 rounded-md border border-rule p-3">
              {renaming === version.id ? (
                <NameForm
                  label="New name"
                  initial={version.name}
                  submit={(name) =>
                    run(async () => {
                      await renameVersion(item.id, version.id, name);
                      setRenaming(null);
                    }, 'Vlo could not rename the version. Try again.')
                  }
                  onCancel={() => {
                    setRenaming(null);
                  }}
                />
              ) : (
                <p className="grid">
                  <span className="font-medium">{version.name}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {formatWords(countWords(version.text, language), countUnit(language))}, saved{' '}
                    {formatTime.format(version.updatedAt)}
                  </span>
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                <Button variant="outline" disabled={busy} onClick={() => void doSwitch(version)}>
                  Switch to this
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={comparing === version.id}
                  onClick={() => {
                    setComparing(comparing === version.id ? null : version.id);
                  }}
                >
                  Compare
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRenaming(version.id);
                  }}
                >
                  Rename
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void doDelete(version)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {compared && <Comparison item={item} kind={kind} editor={editor} doc={doc} version={compared} />}
    </div>
  );
}
