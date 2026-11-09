import { useId } from 'react';
import {
  LETTER_SPACINGS,
  LINE_HEIGHTS,
  setWritingPrefs,
  useWritingPrefs,
  WORD_SPACINGS,
  type WritingPrefs,
} from '@/features/editor/writingPrefs';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { Switch } from '@/ui/switch';

/*
 * Reading comfort on this device (roadmap F37, decision P5). Each choice changes the text on the screen
 * only. The project font and the exports stay as they are.
 */

const STEPS = ['Standard', 'Wider', 'Widest'] as const;

const SPACINGS: readonly {
  key: 'letterSpacing' | 'wordSpacing' | 'lineHeight';
  label: string;
  values: readonly number[];
}[] = [
  { key: 'letterSpacing', label: 'Space between letters', values: LETTER_SPACINGS },
  { key: 'wordSpacing', label: 'Space between words', values: WORD_SPACINGS },
  { key: 'lineHeight', label: 'Space between lines', values: LINE_HEIGHTS },
];

export function ComfortSettings({ onAnnounce }: { onAnnounce: (message: string) => void }) {
  const writing = useWritingPrefs();
  const id = useId();
  return (
    <div className="grid gap-5">
      <p className="text-muted">
        These change your text on the screen of this device. The project and its exports stay as they are.
      </p>
      <div className="flex items-start gap-3">
        <Switch
          id={`${id}-font`}
          checked={writing.comfortFont}
          aria-describedby={`${id}-font-hint`}
          onCheckedChange={(on) => {
            setWritingPrefs({ comfortFont: on });
            onAnnounce(
              on ? 'Your text shows in Atkinson Hyperlegible Next.' : 'Your text shows in its own font.',
            );
          }}
        />
        <div className="grid gap-0.5">
          <label htmlFor={`${id}-font`} className="cursor-pointer">
            Show my text in Atkinson Hyperlegible Next
          </label>
          <p id={`${id}-font-hint`} className="text-sm text-muted">
            A font made so that each letter is easy to tell apart.
          </p>
        </div>
      </div>
      {SPACINGS.map(({ key, label, values }) => (
        <div key={key} className="grid gap-2">
          <p id={`${id}-${key}`}>{label}</p>
          <RadioGroup
            aria-labelledby={`${id}-${key}`}
            className="flex flex-wrap gap-x-6 gap-y-2"
            value={String(values.indexOf(writing[key]))}
            onValueChange={(value) => {
              const step = Number(value);
              const change: Partial<WritingPrefs> = { [key]: values[step] };
              setWritingPrefs(change);
              onAnnounce(`${label}: ${STEPS[step] ?? ''}.`);
            }}
          >
            {STEPS.map((step, index) => (
              <div key={step} className="flex min-h-11 items-center gap-2">
                <RadioGroupItem id={`${id}-${key}-${String(index)}`} value={String(index)} />
                <label htmlFor={`${id}-${key}-${String(index)}`} className="cursor-pointer">
                  {step}
                </label>
              </div>
            ))}
          </RadioGroup>
        </div>
      ))}
    </div>
  );
}
