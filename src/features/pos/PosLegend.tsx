import { X } from 'lucide-react';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { setPosKindOn, setPosOn, usePosPrefs } from './posPrefs';
import { POS_KINDS } from './posTags';

/*
 * The legend of the parts-of-speech colors (Phase 19, Task D5). Each name shows its own color and line
 * shape, and a press turns that kind of word on or off.
 */
export function PosLegend() {
  const prefs = usePosPrefs();
  if (!prefs.on) return null;
  return (
    <div
      role="region"
      aria-label="Parts of speech"
      className="flex flex-wrap items-center gap-2 border-b border-rule bg-bg px-2 py-1.5 text-sm"
    >
      <span className="text-muted">Colors</span>
      {POS_KINDS.map((kind) => {
        const on = !prefs.off.includes(kind.id);
        return (
          <button
            key={kind.id}
            type="button"
            aria-pressed={on}
            title={`${kind.label}: ${kind.line}`}
            onClick={() => {
              setPosKindOn(kind.id, !on);
            }}
            className="min-h-9 rounded-md border border-rule px-2.5 aria-pressed:border-muted pointer-coarse:min-h-11"
          >
            <span className={cn(on ? `vlo-pos-${kind.id}` : 'text-muted line-through')}>{kind.label}</span>
          </button>
        );
      })}
      <Button
        variant="ghost"
        className="ml-auto min-h-9 px-2 pointer-coarse:min-h-11"
        aria-label="Hide parts of speech"
        onClick={() => {
          setPosOn(false);
        }}
      >
        <X aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
