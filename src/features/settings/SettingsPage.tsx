import { useId, useRef, useState } from 'react';
import { useMotionAllowed, usePreferences } from '@/app/PreferencesProvider';
import type { ThemeChoice } from '@/app/preferences';
import { withViewTransition } from '@/ui/motion';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { Switch } from '@/ui/switch';
import { StorageHealth } from './StorageHealth';
import { useDocumentTitle } from '@/app/useDocumentTitle';

const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'System',
  ink: 'Ink',
  paper: 'Paper',
  sepia: 'Sepia',
};

const THEME_HINTS: Record<ThemeChoice, string> = {
  system: 'Follows your device: Ink when dark, Paper when light.',
  ink: 'Light text on a dark page.',
  paper: 'Dark text on a light page.',
  sepia: 'Brown text on a warm page.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule py-6">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  useDocumentTitle('Settings');
  const { prefs, resolvedTheme, setTheme, setCalm } = usePreferences();
  const motion = useMotionAllowed();
  const [announcement, setAnnouncement] = useState('');
  const calmId = useId();
  const calmHintId = useId();
  const themes = useRef<HTMLDivElement>(null);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-semibold">Settings</h1>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="mt-6">
        <Section title="Theme">
          <RadioGroup
            ref={themes}
            aria-label="Theme"
            value={prefs.theme}
            onValueChange={(value) => {
              const choice = value as ThemeChoice;
              // The new theme grows from the radio the writer chose. Safari does not focus a clicked
              // button, so the radio comes from the group, by its value, for a click and a key alike.
              const rect = themes.current
                ?.querySelector(`[role="radio"][value="${CSS.escape(choice)}"]`)
                ?.getBoundingClientRect();
              const origin = rect
                ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
                : undefined;
              withViewTransition(
                motion,
                () => {
                  setTheme(choice);
                },
                { origin, className: 'vlo-theme-reveal' },
              );
              setAnnouncement(`Theme set to ${THEME_LABELS[choice]}.`);
            }}
          >
            {(Object.keys(THEME_LABELS) as ThemeChoice[]).map((choice) => {
              const id = `theme-${choice}`;
              return (
                <div key={choice} className="flex min-h-11 items-start gap-3">
                  <RadioGroupItem id={id} value={choice} aria-describedby={`${id}-hint`} className="mt-0.5" />
                  <div className="grid gap-0.5">
                    <label htmlFor={id} className="cursor-pointer">
                      {THEME_LABELS[choice]}
                    </label>
                    <span id={`${id}-hint`} className="text-sm text-muted">
                      {THEME_HINTS[choice]}
                    </span>
                  </div>
                </div>
              );
            })}
          </RadioGroup>
          <p className="mt-3 text-sm text-muted">
            Showing: <span className="text-text">{THEME_LABELS[resolvedTheme]}</span>
          </p>
        </Section>

        <Section title="Calm mode">
          <div className="flex items-start gap-3">
            <Switch
              id={calmId}
              checked={prefs.calm}
              aria-describedby={calmHintId}
              onCheckedChange={(on) => {
                setCalm(on);
                setAnnouncement(on ? 'Calm mode on.' : 'Calm mode off.');
              }}
            />
            <div className="grid gap-0.5">
              <label htmlFor={calmId} className="cursor-pointer">
                Calm mode
              </label>
              <p id={calmHintId} className="text-sm text-muted">
                Turns off decorative motion, sound and 3D effects. Vlo also does this when your device asks
                for reduced motion.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Storage">
          <StorageHealth />
        </Section>
      </div>
    </div>
  );
}
