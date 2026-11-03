import type { Editor } from '@tiptap/core';
import { useState } from 'react';
import { LINE_SPACINGS, type LineSpacing } from '../../extensions/formatting';
import { OptionPanel } from './OptionPanel';

const DEFAULT = 'default';

const NAMES: Readonly<Record<LineSpacing, string>> = {
  1: 'Single',
  1.15: '1.15',
  1.5: '1.5',
  2: 'Double',
};

export function SpacingPanel({ editor }: { editor: Editor }) {
  const [value, setValue] = useState(() => {
    const spacing: unknown =
      editor.getAttributes('paragraph').lineSpacing ?? editor.getAttributes('heading').lineSpacing;
    return typeof spacing === 'number' ? String(spacing) : DEFAULT;
  });
  return (
    <OptionPanel
      title="Line spacing"
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
  );
}
