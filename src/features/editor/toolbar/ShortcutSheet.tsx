import { Fragment } from 'react';
import { shortcutLabel } from '../commands/keys';
import { GROUP_LABELS, commandsFor, type CommandGroup, type EditorForm } from '../commands/registry';

/* Mod-/ lists every shortcut. Format keys come from the command registry, so this sheet never drifts. */

interface Row {
  keys: string;
  action: string;
}

const MOVING: readonly Row[] = [
  { keys: '/', action: 'Open the tool list at the start of a line or after a space' },
  { keys: 'Mod-k', action: 'Open the command menu' },
  { keys: 'Alt-F10', action: 'Move to the selection menu, or to the toolbar' },
  { keys: 'Escape Tab', action: 'Leave the text (press Escape, then Tab)' },
];

const POEM_KEYS: readonly Row[] = [
  { keys: 'Tab', action: 'Add four spaces' },
  { keys: 'Shift-Tab', action: 'Remove up to four leading spaces' },
  { keys: 'Enter', action: 'New line. On an empty line, start a new stanza' },
  { keys: 'Mod-Enter', action: 'Start a new stanza' },
];

const SCRIPT_KEYS: readonly Row[] = [
  { keys: 'Tab', action: 'Change the element of the line' },
  {
    keys: 'Enter',
    action: 'New line with the element that usually follows. On a character, take the grey name',
  },
];

function keyLabel(keys: string): string {
  return keys
    .split(' ')
    .map((k) => (k === '/' || k === 'Tab' || k === 'Escape' ? k : shortcutLabel(k)))
    .join(', then ');
}

function Table({ title, rows }: { title: string; rows: readonly Row[] }) {
  return (
    <section className="grid gap-1">
      <h3 className="text-sm font-medium text-muted">{title}</h3>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
        {rows.map((row) => (
          <Fragment key={`${row.keys}-${row.action}`}>
            <dt>{row.action}</dt>
            <dd className="text-right">
              <kbd className="rounded border border-rule bg-bg px-1.5 py-0.5 font-mono text-xs">
                {keyLabel(row.keys)}
              </kbd>
            </dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

export function ShortcutSheet({ form }: { form: EditorForm }) {
  const groups = new Map<CommandGroup, Row[]>();
  for (const cmd of commandsFor(form)) {
    if (!cmd.keys) continue;
    const rows = groups.get(cmd.group) ?? [];
    rows.push({ keys: cmd.keys, action: cmd.label });
    groups.set(cmd.group, rows);
  }
  return (
    <div className="grid gap-5">
      {[...groups].map(([group, rows]) => (
        <Table key={group} title={GROUP_LABELS[group]} rows={rows} />
      ))}
      {form === 'poem' && <Table title="Poem lines" rows={POEM_KEYS} />}
      {form === 'script' && <Table title="Script lines" rows={SCRIPT_KEYS} />}
      <Table title="Moving around" rows={MOVING} />
    </div>
  );
}
