import { useId } from 'react';
import { SpacingControls } from '@/features/editor/SpacingControls';
import { setWritingPrefs, useWritingPrefs } from '@/features/editor/writingPrefs';
import { Switch } from '@/ui/switch';

/*
 * Reading comfort on this device (roadmap F37, decision P5). Each choice changes the text on the screen
 * only. The project font and the exports stay as they are. The editor's Spacing panel has the same spacing.
 */

export function ComfortSettings({ onAnnounce }: { onAnnounce: (message: string) => void }) {
  const writing = useWritingPrefs();
  const id = useId();
  return (
    <div className="grid gap-5">
      <p className="text-muted">
        These change your text on the screen of this device. The project and its exports stay as they are.
      </p>
      <div className="flex items-start gap-3">
        <Switch
          id={`${id}-font`}
          checked={writing.comfortFont}
          aria-describedby={`${id}-font-hint`}
          onCheckedChange={(on) => {
            setWritingPrefs({ comfortFont: on });
            onAnnounce(
              on ? 'Your text shows in Atkinson Hyperlegible Next.' : 'Your text shows in its own font.',
            );
          }}
        />
        <div className="grid gap-0.5">
          <label htmlFor={`${id}-font`} className="cursor-pointer">
            Show my text in Atkinson Hyperlegible Next
          </label>
          <p id={`${id}-font-hint`} className="text-sm text-muted">
            A font made so that each letter is easy to tell apart.
          </p>
        </div>
      </div>
      <SpacingControls />
    </div>
  );
}
