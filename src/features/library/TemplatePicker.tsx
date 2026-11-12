import {
  BookOpen,
  Check,
  Clapperboard,
  Feather,
  GraduationCap,
  Hourglass,
  Newspaper,
  NotebookPen,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import type { Template } from '@/lib/db';
import { cn } from '@/ui/cn';
import { TEMPLATE_ORDER, TEMPLATES } from './templates';

const ICONS: Record<Template, LucideIcon> = {
  novel: BookOpen,
  memoir: Hourglass,
  poetry: Feather,
  open: NotebookPen,
  script: Clapperboard,
  essay: ScrollText,
  article: Newspaper,
  research: GraduationCap,
};

/** The order of the cards: stories and poems, then the nonfiction modes, then open writing. */
const CARD_ORDER: readonly Template[] = [
  'novel',
  'memoir',
  'poetry',
  'script',
  'essay',
  'article',
  'research',
  'open',
];

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
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
        {CARD_ORDER.map((template) => {
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
                'relative grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 rounded-[var(--radius-card)] border border-rule bg-bg py-3 pr-10 pl-3 text-left transition-[border-color,box-shadow,scale] duration-200 ease-out active:scale-[0.98]',
                'hover:border-muted data-[state=checked]:border-accent data-[state=checked]:shadow-[inset_0_0_0_1px_var(--accent)]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-3 right-3 flex size-5 items-center justify-center rounded-full border transition-colors duration-200 ease-out',
                  checked ? 'border-accent bg-accent text-on-accent' : 'border-muted',
                )}
              >
                <Check className={cn('vlo-swap size-3.5', !checked && 'vlo-swap-out')} strokeWidth={3} />
              </span>
              <Icon aria-hidden="true" className="row-span-2 size-5 self-start text-accent-text" />
              <span className="font-display text-base font-semibold">{def.label}</span>
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
