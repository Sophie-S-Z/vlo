import { useId } from 'react';
import { Label } from '@/ui/label';
import { structuresOf } from './structures';
import { TEMPLATES } from './templates';
import type { Template } from '@/lib/db';

/**
 * The structure to start a mode from (Phase 17 decision M2): a list of choices, with the sections of the
 * chosen one under it, so the writer sees what they get.
 */
export function StructurePicker({
  template,
  value,
  onChange,
}: {
  template: Template;
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const options = structuresOf(template);
  const chosen = options.find((s) => s.id === value) ?? options[0];
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Start the {TEMPLATES[template].label.toLowerCase()} from</Label>
      <select
        id={id}
        value={chosen?.id}
        aria-describedby={`${id}-about`}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="min-h-11 rounded-md border border-rule bg-bg px-3 text-base text-text pointer-fine:min-h-10 pointer-fine:text-sm"
      >
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <p id={`${id}-about`} className="text-sm text-muted">
        {chosen?.description}
      </p>
    </div>
  );
}
