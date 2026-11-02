import { Focus } from 'lucide-react';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { setFocusPrefs, useFocusPrefs } from './focusPrefs';

/** Focus mode, typewriter scrolling and focus-line dimming. */
export function FocusControls({ onFocusMode }: { onFocusMode: () => void }) {
  const prefs = useFocusPrefs();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Focus aria-hidden="true" className="size-4" />
          Focus
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
