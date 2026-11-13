import { useId, useState } from 'react';
import { sharingReady } from '@/features/share/rpc';
import { Switch } from '@/ui/switch';
import { readDailyCount, setDailyCountOn } from './dailyCountState';

/*
 * The switch of the daily count in Settings (Phase 18, decision A3). It is on by default. Off forgets the
 * random install id of this browser.
 */

export function DailyCountSetting() {
  const id = useId();
  const [on, setOn] = useState(() => !readDailyCount().off);
  if (!sharingReady()) return null;
  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        checked={on}
        aria-describedby={`${id}-hint`}
        onCheckedChange={(next) => {
          setDailyCountOn(next);
          setOn(next);
        }}
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="cursor-pointer">
          Count this device once a day
        </label>
        <p id={`${id}-hint`} className="text-sm text-muted">
          {on
            ? 'On. Once a day Vlo sends a random id for this browser, the Vlo version, the kind of device and whether Vlo is installed, so its makers know how many people use it. Never text, a title or a name.'
            : 'Off. Vlo does not count this device.'}
        </p>
      </div>
    </div>
  );
}
