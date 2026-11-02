import { ViewTransition, type ComponentProps } from 'react';
import { useMotionAllowed } from '@/app/PreferencesProvider';

/**
 * React's `<ViewTransition>`, present only while motion is allowed. With Calm mode or reduced motion
 * there is no boundary, so React starts no view transition at all.
 */
export function MotionViewTransition({ children, ...props }: ComponentProps<typeof ViewTransition>) {
  const motion = useMotionAllowed();
  if (!motion) return children;
  return <ViewTransition {...props}>{children}</ViewTransition>;
}
