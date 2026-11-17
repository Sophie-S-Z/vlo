import { useCallback } from 'react';
import { bytesBlob, type FileBytes } from '@/lib/db';

/**
 * A ref that gives the element a blob: URL of the stored bytes `data` in `src` while it is on the page.
 * The URL goes when the element goes, so React's Strict Mode never revokes a URL that an element still
 * shows.
 */
export function useBlobSource(data: FileBytes | undefined, type: string) {
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element || !data) return;
      const url = URL.createObjectURL(bytesBlob(data, type));
      element.setAttribute('src', url);
      return () => {
        URL.revokeObjectURL(url);
      };
    },
    [data, type],
  );
}
