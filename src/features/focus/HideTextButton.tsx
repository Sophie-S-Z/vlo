import { EyeOff } from 'lucide-react';
import { ariaShortcut, shortcutLabel } from '@/features/editor/commands/keys';
import { Button } from '@/ui/button';
import { ICON_BUTTON } from '@/ui/tip';
import { setFocusPrefs, useFocusPrefs } from './focusPrefs';
import { HIDE_TEXT_KEYS } from './hideText';

/**
 * The one-press way back from Hide the text. It shows only while the text is hidden (Phase 17 decision
 * S1), beside the timer, so it stays on the screen in focus mode too. The Focus menu, the command menu and
 * the shortcut turn Hide the text on.
 */
export function HideTextButton() {
  const { hide } = useFocusPrefs();
  if (!hide) return null;
  const tip = `Show the text (${shortcutLabel(HIDE_TEXT_KEYS)})`;
  return (
    <Button
      variant="ghost"
      className={ICON_BUTTON}
      aria-pressed
      aria-keyshortcuts={ariaShortcut(HIDE_TEXT_KEYS)}
      data-tip={tip}
      onClick={() => {
        setFocusPrefs({ hide: false });
      }}
    >
      <EyeOff aria-hidden="true" className="size-4" />
      <span className="sr-only">Hide text</span>
    </Button>
  );
}
