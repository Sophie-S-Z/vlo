import type { Editor } from '@tiptap/core';
import { useState } from 'react';
import { LINE_SPACINGS, type LineSpacing } from '../../extensions/formatting';
import { SpacingControls } from '../../SpacingControls';
import { OptionPanel } from './OptionPanel';

const DEFAULT = 'default';

const NAMES: Readonly<Record<LineSpacing, string>> = {
  1: 'Single',
  1.15: '1.15',
  1.5: '1.5',
  2: 'Double',
};

/**
 * The space between letters, words and lines on the screen, in every kind of writing. Prose also sets the
 * line spacing of a paragraph, which the project keeps and exports.
 */
export function SpacingPanel({ editor }: { editor: Editor }) {
  const [value, setValue] = useState(() => {
    const spacing: unknown =
      editor.getAttributes('paragraph').lineSpacing ?? editor.getAttributes('heading').lineSpacing;
    return typeof spacing === 'number' ? String(spacing) : DEFAULT;
  });
  const prose = 'setLineSpacing' in editor.commands;
  return (
    <div className="grid w-72 max-w-full gap-5">
      <div className="grid gap-2">
        <h2 className="text-sm font-medium">Spacing on this screen</h2>
        <p className="text-xs text-muted">
          For every project on this device. Exports keep their own spacing.
        </p>
        <SpacingControls />
      </div>
      {prose && (
        <OptionPanel
          title="Line spacing of this paragraph"
          value={value}
          options={[
            { value: DEFAULT, label: 'Vlo default' },
            ...LINE_SPACINGS.map((s) => ({ value: String(s), label: NAMES[s] })),
          ]}
          onChoose={(next) => {
            const spacing = next === DEFAULT ? null : (Number(next) as LineSpacing);
            editor.chain().setLineSpacing(spacing).run();
            setValue(next);
          }}
        />
      )}
    </div>
  );
}
