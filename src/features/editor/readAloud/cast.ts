/*
 * The voices of a table read (roadmap F58, plan Task K3), for each project on this device. Voices differ
 * from device to device, so the choices stay in this browser and never sync.
 */

export interface CastSettings {
  on: boolean;
  /** The voice URI that the writer chose for each character, by Codex entry id. */
  voices: Record<string, string>;
}

const key = (projectId: string) => `vlo:tableRead:${projectId}`;

export function getCast(projectId: string): CastSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(key(projectId)) ?? 'null') as Partial<CastSettings> | null;
    const voices: Record<string, string> = {};
    if (raw && typeof raw.voices === 'object')
      for (const [speaker, uri] of Object.entries(raw.voices))
        if (typeof uri === 'string') voices[speaker] = uri;
    return { on: raw?.on === true, voices };
  } catch {
    return { on: false, voices: {} };
  }
}

export function setCast(projectId: string, change: Partial<CastSettings>): CastSettings {
  const next = { ...getCast(projectId), ...change };
  try {
    localStorage.setItem(key(projectId), JSON.stringify(next));
  } catch {
    // A full or blocked storage keeps the choice for this visit only.
  }
  return next;
}

/**
 * The voice of each speaker. The narrator has the writer's main voice. A character has the writer's
 * choice, or else one of the other voices in turn, so each character sounds different with no setup.
 */
export function voiceFor(
  speakers: readonly string[],
  voices: readonly string[],
  chosen: Readonly<Record<string, string>>,
  narrator: string | null,
): (speaker: string | null) => string | null {
  const others = voices.filter((v) => v !== narrator);
  return (speaker) => {
    if (speaker === null) return narrator;
    const picked = chosen[speaker];
    if (picked !== undefined && voices.includes(picked)) return picked;
    const index = speakers.indexOf(speaker);
    return others.length === 0 || index === -1 ? narrator : (others[index % others.length] ?? narrator);
  };
}
