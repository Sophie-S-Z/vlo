import { Check, Sunset } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { NO_SCENE, SCENES, type SceneChoice } from './scenes';
import { retrySceneMotion, useSceneSlow } from './slowScene';

const tileClass =
  'group grid gap-1.5 rounded-md p-1 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** The scene picker above the manuscript (plan Task A8). The scene belongs to the project. */
export function ScenePicker({
  scene,
  onScene,
}: {
  scene: SceneChoice;
  onScene: (scene: SceneChoice) => void;
}) {
  const titleId = useId();
  const motion = useMotionAllowed();
  const slow = useSceneSlow();
  const label = SCENES.find((s) => s.id === scene)?.label ?? 'No scene';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label={`Scene: ${label}`}>
          <Sunset aria-hidden="true" className="size-4" />
          <span className="max-sm:sr-only">{scene === NO_SCENE ? 'Scene' : label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-labelledby={titleId}
        className="grid w-[min(22rem,calc(100vw-1.5rem))] gap-3"
      >
        <h2 id={titleId} className="text-sm font-medium">
          Scene
        </h2>
        <RadioGroupPrimitive.Root
          aria-labelledby={titleId}
          value={scene}
          onValueChange={(next) => {
            onScene(next as SceneChoice);
          }}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {[
            { id: NO_SCENE, label: 'No scene', hint: 'The page on its theme color.', still: '' },
            ...SCENES,
          ].map((option) => (
            <RadioGroupPrimitive.Item key={option.id} value={option.id} className={tileClass}>
              <span
                aria-hidden="true"
                className={cn(
                  'relative flex aspect-[16/10] items-center justify-center rounded-sm border border-rule group-data-[state=checked]:border-accent group-data-[state=checked]:ring-2 group-data-[state=checked]:ring-accent',
                  option.id === NO_SCENE && 'bg-bg',
                )}
                style={option.still ? { background: option.still } : undefined}
              >
                {option.id === scene && (
                  <span className="absolute top-1 right-1 rounded-full bg-accent p-0.5 text-on-accent">
                    <Check className="size-3" />
                  </span>
                )}
              </span>
              <span className="text-text">{option.label}</span>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        <p className="text-xs text-muted">
          {scene === NO_SCENE
            ? 'A scene fills the space around the page. The page keeps its theme colors.'
            : (SCENES.find((s) => s.id === scene)?.hint ?? '')}{' '}
          {motion
            ? 'The scene moves gently and rests while you type.'
            : 'Calm mode or reduced motion is on, so the scene stays still.'}
        </p>
        {motion && slow && scene !== NO_SCENE && (
          <div role="status" className="grid gap-2 rounded-md border border-rule bg-bg p-2 text-xs">
            <p>
              This device drew the moving scene slowly, so the scene stays still and your typing stays quick.
            </p>
            <Button
              variant="ghost"
              className="justify-self-start px-2 pointer-fine:min-h-8"
              onClick={retrySceneMotion}
            >
              Try the motion again
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
