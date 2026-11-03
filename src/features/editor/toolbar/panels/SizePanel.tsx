import type { Editor } from '@tiptap/core';
import { useState } from 'react';
import { FONT_SIZES } from '../../extensions/formatting';
import { OptionPanel } from './OptionPanel';

const NORMAL = 'normal';

export function SizePanel({ editor }: { editor: Editor }) {
  const [value, setValue] = useState(() => {
    const size: unknown = editor.getAttributes('textStyle').fontSize;
    return typeof size === 'string' && size !== '' ? size : NORMAL;
  });
  return (
    <OptionPanel
      title="Font size"
      value={value}
      options={FONT_SIZES.map((s) => ({
        value: s.value ?? NORMAL,
        label: s.label,
        sample: { fontSize: s.value ?? '1em', lineHeight: 1.2 },
      }))}
      onChoose={(next) => {
        const chain = editor.chain();
        (next === NORMAL ? chain.unsetFontSize() : chain.setFontSize(next)).run();
        setValue(next);
      }}
    />
  );
}
