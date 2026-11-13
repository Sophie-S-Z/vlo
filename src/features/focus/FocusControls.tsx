import { Focus } from 'lucide-react';
import { Button } from '@/ui/button';
import { ICON_BUTTON } from '@/ui/tip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { HIDE_STYLES, setFocusPrefs, useFocusPrefs, type HideStyle } from './focusPrefs';

const HIDE_LABEL: Record<HideStyle, string> = { blur: 'Blur the words', bars: 'Cover the words with bars' };

/** Focus mode, typewriter scrolling, focus-line dimming and the choices of Hide the text. */
export function FocusControls({ onFocusMode }: { onFocusMode: () => void }) {
  const prefs = useFocusPrefs();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={ICON_BUTTON} data-tip="Focus and Hide the text" data-tool="focus">
          <Focus aria-hidden="true" className="size-4" />
          <span className="sr-only">Focus</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onFocusMode}>Enter focus mode</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={prefs.typewriter}
          onCheckedChange={(checked) => {
            setFocusPrefs({ typewriter: checked });
          }}
        >
          Typewriter scrolling
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.dim}
          onCheckedChange={(checked) => {
            setFocusPrefs({ dim: checked });
          }}
        >
          Dim other lines
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={prefs.hide}
          onCheckedChange={(checked) => {
            setFocusPrefs({ hide: checked });
          }}
        >
          Hide the text
        </DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup
          aria-label="How to hide the text"
          value={prefs.hideStyle}
          onValueChange={(value) => {
            // Picking a style shows it at once, so the choice turns Hide the text on.
            setFocusPrefs({ hideStyle: value as HideStyle, hide: true });
          }}
        >
          {HIDE_STYLES.map((style) => (
            <DropdownMenuRadioItem key={style} value={style}>
              {HIDE_LABEL[style]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuCheckboxItem
          checked={prefs.hideKeep}
          onCheckedChange={(checked) => {
            setFocusPrefs({ hideKeep: checked });
          }}
        >
          Keep my paragraph clear
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
