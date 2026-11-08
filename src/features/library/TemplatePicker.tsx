import { BookOpen, Check, Feather, Hourglass, NotebookPen, type LucideIcon } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import type { Template } from '@/lib/db';
import { cn } from '@/ui/cn';
import { TEMPLATE_ORDER, TEMPLATES } from './templates';

const ICONS: Record<Template, LucideIcon> = {
  novel: BookOpen,
  memoir: Hourglass,
  poetry: Feather,
  open: NotebookPen,
};

/* The cards lean apart like loose cards on a desk on wider screens. Calm mode and reduced motion keep them flat. */
const FAN: Record<Template, string> = {
  novel: 'sm:-rotate-1',
  memoir: 'sm:rotate-1 sm:translate-y-1',
  poetry: 'sm:rotate-1',
  open: 'sm:-rotate-1 sm:translate-y-1',
};

/** The template that a new project starts with. */
export const SUGGESTED_TEMPLATE: Template = 'novel';

export interface TemplatePick {
  /** The picked templates, in `TEMPLATE_ORDER`. Never empty. */
  value: Template[];
  /** True while the value is only the suggestion, so the writer's first pick replaces it. */
  suggested: boolean;
}

/** The first pick of the writer replaces the suggestion. Each later pick adds or removes a template. */
export function togglePick(pick: TemplatePick, template: Template): TemplatePick {
  if (pick.suggested) return { value: [template], suggested: false };
  const on = pick.value.includes(template);
  // A project needs one template, so the last one stays.
  if (on && pick.value.length === 1) return { ...pick, suggested: false };
  const next = on ? pick.value.filter((t) => t !== template) : [...pick.value, template];
  return { value: TEMPLATE_ORDER.filter((t) => next.includes(t)), suggested: false };
}

export function newPick(): TemplatePick {
  return { value: [SUGGESTED_TEMPLATE], suggested: true };
}

/** The state of a template picker: the pick, a toggle for one card and a reset. */
export function useTemplatePick() {
  const [pick, setPick] = useState<TemplatePick>(newPick);
  const toggle = useCallback((template: Template) => {
    setPick((prev) => togglePick(prev, template));
  }, []);
  const reset = useCallback(() => {
    setPick(newPick());
  }, []);
  return { pick, toggle, reset };
}

interface TemplatePickerProps {
  pick: TemplatePick;
  onToggle: (template: Template) => void;
  label?: string;
}

/** The templates as checkbox cards. The writer picks one or more, and the project mixes their tools. */
export function TemplatePicker({ pick, onToggle, label = 'Template' }: TemplatePickerProps) {
  const id = useId();
  return (
    <div role="group" aria-label={label} aria-describedby={`${id}-hint`}>
      <p id={`${id}-hint`} className="mb-3 text-sm text-muted">
        Pick one or more. A project with more than one gets the tools of each.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 sm:px-2 sm:pt-1 sm:pb-2">
        {TEMPLATE_ORDER.map((template) => {
          const def = TEMPLATES[template];
          const Icon = ICONS[template];
          const checked = pick.value.includes(template);
          return (
            <button
              key={template}
              type="button"
              role="checkbox"
              aria-checked={checked}
              data-state={checked ? 'checked' : 'unchecked'}
              aria-describedby={`${id}-${template}`}
              onClick={() => {
                onToggle(template);
              }}
              className={cn(
                'relative flex flex-col items-start gap-2 rounded-[var(--radius-card)] border border-rule bg-bg p-4 text-left transition-[transform,border-color,box-shadow] duration-500 ease-[var(--ease-reveal)]',
                'hover:shadow-[var(--shadow-hover)] data-[state=checked]:border-accent data-[state=checked]:shadow-[inset_0_0_0_1px_var(--accent)]',
                FAN[template],
                'sm:hover:translate-y-0 sm:hover:rotate-0 motion-reduce:transform-none in-[[data-calm=true]]:transform-none',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-3 right-3 flex size-5 items-center justify-center rounded-full border',
                  checked ? 'border-accent bg-accent text-on-accent' : 'border-rule',
                )}
              >
                {checked && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <Icon aria-hidden="true" className="size-6 text-accent-text" />
              <span className="font-display text-lg font-semibold">{def.label}</span>
              <span id={`${id}-${template}`} className="text-sm text-muted">
                {def.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
