import { useEffect, useRef, useState } from 'react';
import { downloadVoices, voicesReady } from './natural';

/* Whether the natural voices are on this device, and their download after the writer agrees. */

export type VoiceDownload =
  { step: 'idle' } | { step: 'download'; share: number } | { step: 'error'; message: string };

export function useNaturalVoices() {
  // Null while Vlo looks. A browser with no Cache Storage cannot keep them, so they are not there.
  const [ready, setReady] = useState<boolean | null>(null);
  const [download, setDownload] = useState<VoiceDownload>({ step: 'idle' });
  const stop = useRef<AbortController | null>(null);

  useEffect(() => {
    voicesReady().then(setReady, () => {
      setReady(false);
    });
    // A panel that closes during a download stops it.
    return () => {
      stop.current?.abort();
    };
  }, []);

  return {
    ready,
    download,
    /** Downloads the voices. True when they are on this device after it. */
    get: async (): Promise<boolean> => {
      const controller = new AbortController();
      stop.current = controller;
      setDownload({ step: 'download', share: 0 });
      try {
        await downloadVoices((share) => {
          setDownload({ step: 'download', share });
        }, controller.signal);
        setReady(true);
        setDownload({ step: 'idle' });
        return true;
      } catch {
        setDownload(
          controller.signal.aborted
            ? { step: 'idle' }
            : { step: 'error', message: 'The download stopped. Check the connection and try again.' },
        );
        return false;
      } finally {
        stop.current = null;
      }
    },
    stop: () => {
      stop.current?.abort();
    },
  };
}
