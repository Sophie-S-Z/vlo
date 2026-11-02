import { useEffect } from 'react';

/** Sets the browser tab title to "<title> · Vlo", so each screen has its own name. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Vlo`;
  }, [title]);
}
