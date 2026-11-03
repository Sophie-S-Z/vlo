import { ToggleGroup } from 'radix-ui';
import type { CSSProperties } from 'react';

export interface PanelOption {
  value: string;
  label: string;
  /** The style of the sample text, such as its size. */
  sample?: CSSProperties;
}

const optionClass =
  'flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm outline-none hover:bg-bg focus-visible:ring-2 focus-visible:ring-accent data-[state=on]:bg-bg data-[state=on]:text-accent-text pointer-fine:min-h-9';

/** A titled list of choices, one of which is on. Arrow keys move between them. */
export function OptionPanel({
  title,
  options,
  value,
  onChoose,
}: {
  title: string;
  options: readonly PanelOption[];
  value: string;
  onChoose: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <h2 className="text-sm font-medium">{title}</h2>
      <ToggleGroup.Root
        type="single"
        orientation="vertical"
        aria-label={title}
        value={value}
        onValueChange={(next) => {
          // A press on the chosen option keeps it chosen.
          onChoose(next || value);
        }}
        className="grid gap-0.5"
      >
        {options.map((option) => (
          <ToggleGroup.Item key={option.value} value={option.value} className={optionClass}>
            <span style={option.sample}>{option.label}</span>
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}
