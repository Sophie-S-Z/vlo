import { ViewTransition, type ComponentProps } from 'react';
import { useMotionAllowed } from '@/app/PreferencesProvider';

/**
 * React's `<ViewTransition>`. With Calm mode or reduced motion every animation class is "none" and there
 * is no shared name, so React starts no view transition. The boundary itself always stays, so turning
 * motion on or off never remounts the page below it (an open editor keeps its text, caret and undo).
 */
export function MotionViewTransition({ children, ...props }: ComponentProps<typeof ViewTransition>) {
  const motion = useMotionAllowed();
  if (motion) return <ViewTransition {...props}>{children}</ViewTransition>;
  return (
    <ViewTransition default="none" enter="none" exit="none" update="none" share="none">
      {children}
    </ViewTransition>
  );
}
