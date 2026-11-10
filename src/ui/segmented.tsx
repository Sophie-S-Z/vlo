import { cn } from './cn';

/** A row of buttons that picks one of a few options, such as By time and By theme. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-rule p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => {
            onChange(option.value);
          }}
          className={cn(
            'flex min-h-10 items-center rounded-md px-3 text-sm font-medium',
            value === option.value ? 'bg-text text-bg' : 'text-muted hover:text-text',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
