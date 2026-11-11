import { Eye, EyeOff } from 'lucide-react';
import { ariaShortcut, shortcutLabel } from '@/features/editor/commands/keys';
import { Button } from '@/ui/button';
import { setFocusPrefs, useFocusPrefs } from './focusPrefs';
import { HIDE_TEXT_KEYS } from './hideText';

/**
 * The one-press switch for Hide the text. It sits beside the timer, so it stays on the screen in focus
 * mode too. The Focus menu holds the style and the "keep my paragraph clear" choice.
 */
export function HideTextButton() {
  const { hide } = useFocusPrefs();
  const Icon = hide ? EyeOff : Eye;
  return (
    <Button
      variant="ghost"
      className="max-sm:min-w-11 max-sm:px-0"
      aria-pressed={hide}
      aria-keyshortcuts={ariaShortcut(HIDE_TEXT_KEYS)}
      title={`Hide the text (${shortcutLabel(HIDE_TEXT_KEYS)})`}
      onClick={() => {
        setFocusPrefs({ hide: !hide });
      }}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span className="max-sm:sr-only">Hide text</span>
    </Button>
  );
}
