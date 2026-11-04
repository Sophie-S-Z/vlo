import { useEffect, useState } from 'react';

/*
 * Read aloud uses only voices that run on the device (`localService`), so no text leaves it (plan E2,
 * US09). A browser can also offer voices that send the text to a server; Vlo never lists those.
 */

export interface VoiceChoice {
  uri: string;
  name: string;
  lang: string;
}

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** The on-device voices, the device default first, then the writer's language, then by name. */
export function localVoices(
  voices: readonly SpeechSynthesisVoice[],
  language = navigator.language,
): VoiceChoice[] {
  const base = language.toLowerCase().split('-')[0] ?? '';
  const rank = (v: SpeechSynthesisVoice) => {
    if (v.default) return 0;
    const lang = v.lang.toLowerCase();
    if (lang === language.toLowerCase()) return 1;
    if (lang.split('-')[0] === base) return 2;
    return 3;
  };
  return voices
    .filter((v) => v.localService)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang }));
}

/** The on-device voice with this URI, or null. A remote voice is never returned. */
export function findLocalVoice(uri: string | null): SpeechSynthesisVoice | null {
  if (!speechAvailable()) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.localService);
  return voices.find((v) => v.voiceURI === uri) ?? voices.find((v) => v.default) ?? voices[0] ?? null;
}

/** How long to wait for a browser that lists its voices late before saying the device has none. */
export const VOICE_WAIT_MS = 1500;

export interface VoiceList {
  /** False until the browser lists its voices or the wait ends. */
  ready: boolean;
  voices: VoiceChoice[];
}

/** The on-device voices. Some browsers list them only after a `voiceschanged` event. */
export function useLocalVoices(): VoiceList {
  const [list, setList] = useState<VoiceList>(() => {
    if (!speechAvailable()) return { ready: true, voices: [] };
    const voices = window.speechSynthesis.getVoices();
    return { ready: voices.length > 0, voices: localVoices(voices) };
  });
  useEffect(() => {
    if (!speechAvailable()) return;
    const synth = window.speechSynthesis;
    const update = () => {
      const voices = synth.getVoices();
      setList({ ready: true, voices: localVoices(voices) });
    };
    synth.addEventListener('voiceschanged', update);
    const timer = setTimeout(update, VOICE_WAIT_MS);
    return () => {
      synth.removeEventListener('voiceschanged', update);
      clearTimeout(timer);
    };
  }, []);
  return list;
}
