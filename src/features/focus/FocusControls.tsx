import { Focus } from 'lucide-react';
import { Button } from '@/ui/button';
import { ICON_BUTTON } from '@/ui/tip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
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
        {/* In focus mode, Leave focus mode takes the place of this menu's button. */}
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
        {HIDE_STYLES.map((style) => (
          // Each way to hide is a switch of its own: a second choice of the way that is on shows the text.
          <DropdownMenuCheckboxItem
            key={style}
            checked={prefs.hide && prefs.hideStyle === style}
            onCheckedChange={(checked) => {
              setFocusPrefs(checked ? { hideStyle: style, hide: true } : { hide: false });
            }}
          >
            {HIDE_LABEL[style]}
          </DropdownMenuCheckboxItem>
        ))}
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
