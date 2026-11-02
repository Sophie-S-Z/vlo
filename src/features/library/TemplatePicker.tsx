import { BookOpen, Feather, Hourglass, type LucideIcon } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import type { Template } from '@/lib/db';
import { cn } from '@/ui/cn';
import { TEMPLATE_ORDER, TEMPLATES } from './templates';

const ICONS: Record<Template, LucideIcon> = { novel: BookOpen, memoir: Hourglass, poetry: Feather };

/* The three cards lean apart like a hand of cards on wider screens. Calm mode and reduced motion keep them flat. */
const FAN: Record<Template, string> = {
  novel: 'sm:-rotate-3 sm:translate-y-2',
  memoir: 'sm:-translate-y-1',
  poetry: 'sm:rotate-3 sm:translate-y-2',
};

interface TemplatePickerProps {
  value: Template;
  onChange: (template: Template) => void;
  label?: string;
}

/** The three templates as radio cards. Arrow keys move between them. */
export function TemplatePicker({ value, onChange, label = 'Template' }: TemplatePickerProps) {
  const id = useId();
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        onChange(next as Template);
      }}
      orientation="horizontal"
      className="grid gap-3 sm:grid-cols-3 sm:gap-4 sm:px-2 sm:pt-2 sm:pb-4"
    >
      {TEMPLATE_ORDER.map((template) => {
        const def = TEMPLATES[template];
        const Icon = ICONS[template];
        return (
          <RadioGroupPrimitive.Item
            key={template}
            value={template}
            aria-describedby={`${id}-${template}`}
            className={cn(
              'flex flex-col items-start gap-2 rounded-[var(--radius-card)] border border-rule bg-bg p-4 text-left transition-[transform,border-color,box-shadow] duration-500 ease-[var(--ease-reveal)]',
              'hover:shadow-[var(--shadow-hover)] data-[state=checked]:border-accent data-[state=checked]:shadow-[inset_0_0_0_1px_var(--accent)]',
              FAN[template],
              'sm:hover:translate-y-0 sm:hover:rotate-0 motion-reduce:transform-none in-[[data-calm=true]]:transform-none',
            )}
          >
            <Icon aria-hidden="true" className="size-6 text-accent-text" />
            <span className="font-display text-lg font-semibold">{def.label}</span>
            <span id={`${id}-${template}`} className="text-sm text-muted">
              {def.description}
            </span>
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
