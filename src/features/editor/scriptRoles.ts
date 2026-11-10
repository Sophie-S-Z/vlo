/*
 * The elements of a script (roadmap 2 F63) and the order that Tab and Enter follow. The editor, the
 * export tree and the Fountain and FDX files share this list. It has no editor code, so the export
 * worker can read it.
 */

export const SCRIPT_ROLES = [
  'heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'lyric',
] as const;
export type ScriptRole = (typeof SCRIPT_ROLES)[number];

export const ROLE_LABELS: Readonly<Record<ScriptRole, string>> = {
  heading: 'Scene heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  lyric: 'Lyric',
};

/** The roles in capital letters. The text keeps what the writer typed, and each view and export shows capitals. */
export const CAPITAL_ROLES: ReadonlySet<ScriptRole> = new Set(['heading', 'character', 'transition']);

export const SCRIPT_LINE = 'scriptLine';

const ENTER: Readonly<Record<ScriptRole, ScriptRole>> = {
  heading: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'action',
  transition: 'heading',
  lyric: 'lyric',
};

const TAB: Readonly<Record<ScriptRole, ScriptRole>> = {
  heading: 'action',
  action: 'character',
  character: 'transition',
  transition: 'heading',
  dialogue: 'parenthetical',
  parenthetical: 'dialogue',
  lyric: 'dialogue',
};

/** The role of the new line after Enter, or the line's next role after Tab. */
export function nextRole(role: ScriptRole, key: 'Enter' | 'Tab'): ScriptRole {
  return (key === 'Enter' ? ENTER : TAB)[role];
}

export function scriptRole(value: unknown): ScriptRole {
  return SCRIPT_ROLES.find((role) => role === value) ?? 'action';
}
