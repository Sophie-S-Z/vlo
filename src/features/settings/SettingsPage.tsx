import { useId, useRef, useState } from 'react';
import { useMotionAllowed, usePreferences } from '@/app/PreferencesProvider';
import type { ThemeChoice } from '@/app/preferences';
import { withViewTransition } from '@/ui/motion';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { Switch } from '@/ui/switch';
import { StorageHealth } from './StorageHealth';
import { FolderSave } from '@/features/backup/FolderSave';
import { SafariSteps } from '@/features/backup/SafariSteps';
import { setWritingPrefs, useWritingPrefs } from '@/features/editor/writingPrefs';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { UsageSettings } from '@/features/usage/UsageSettings';

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

function SettingSwitch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} aria-describedby={`${id}-hint`} onCheckedChange={onChange} />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="cursor-pointer">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      </div>
    </div>
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
  const writing = useWritingPrefs();

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

        <Section title="Writing">
          <div className="grid gap-5">
            <SettingSwitch
              label="Smart punctuation in prose"
              hint={
                'Turns straight quotes into curly quotes, -- into an em dash and ... into an ellipsis as you type. Backspace right after a change puts back what you typed.'
              }
              checked={writing.smartProse}
              onChange={(on) => {
                setWritingPrefs({ smartProse: on });
                setAnnouncement(on ? 'Smart punctuation in prose on.' : 'Smart punctuation in prose off.');
              }}
            />
            <SettingSwitch
              label="Smart punctuation in poems"
              hint="Off at first, so every character in a poem stays as you type it."
              checked={writing.smartPoems}
              onChange={(on) => {
                setWritingPrefs({ smartPoems: on });
                setAnnouncement(on ? 'Smart punctuation in poems on.' : 'Smart punctuation in poems off.');
              }}
            />
          </div>
        </Section>

        <Section title="Storage">
          <StorageHealth />
        </Section>

        <Section title="Backups">
          <p className="text-muted">
            A backup is one .vlo.zip file with a whole project. Back up a project from the menu on its card in
            the Library, or with Back up project in the command menu. To move a project to another device,
            choose Import backup in the Library there.
          </p>
          <FolderSave />
          <SafariSteps closable={false} className="mt-4" />
        </Section>

        <Section title="Usage counts">
          <UsageSettings />
        </Section>
      </div>
    </div>
  );
}
