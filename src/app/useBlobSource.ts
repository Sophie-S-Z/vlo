import { useCallback } from 'react';

/**
 * A ref that gives the element a blob: URL of `blob` in `src` while it is on the page. The URL goes when
 * the element goes, so React's Strict Mode never revokes a URL that an element still shows.
 */
export function useBlobSource(blob: Blob | undefined) {
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element || !blob) return;
      const url = URL.createObjectURL(blob);
      element.setAttribute('src', url);
      return () => {
        URL.revokeObjectURL(url);
      };
    },
    [blob],
  );
}
