/*
 * The text of a footnote. A footnote node keeps its note in the `content` attribute as a list of text
 * runs, each with its inline styles (plan decision 4). Every value is checked when it is read, so
 * pasted HTML or a damaged document cannot put other data into a note.
 */

export const NOTE_MARKS = ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript'] as const;
export type NoteMark = (typeof NOTE_MARKS)[number];

export interface NoteRun {
  type: 'text';
  text: string;
  marks?: { type: NoteMark }[];
}

export type NoteContent = NoteRun[];

/** The longest note, in characters. A longer note keeps its start. */
export const MAX_NOTE_LENGTH = 4000;

function isNoteMark(value: unknown): value is NoteMark {
  return NOTE_MARKS.some((m) => m === value);
}

/** One line of text: a note is one paragraph, so line breaks and tabs become spaces. */
function flatten(text: string): string {
  return text.replace(/[\r\n\t\u2028\u2029]+/g, ' ');
}

/** A note from untrusted data. Plain text becomes one run. Anything else becomes an empty note. */
export function parseNote(value: unknown): NoteContent {
  if (typeof value === 'string') {
    const text = flatten(value).slice(0, MAX_NOTE_LENGTH);
    return text === '' ? [] : [{ type: 'text', text }];
  }
  if (!Array.isArray(value)) return [];
  const runs: NoteContent = [];
  let room = MAX_NOTE_LENGTH;
  for (const raw of value) {
    if (room <= 0) break;
    if (!raw || typeof raw !== 'object') continue;
    const { text, marks } = raw as { text?: unknown; marks?: unknown };
    if (typeof text !== 'string') continue;
    const clean = flatten(text).slice(0, room);
    if (clean === '') continue;
    room -= clean.length;
    const kept: NoteMark[] = [];
    if (Array.isArray(marks)) {
      for (const mark of marks) {
        const type = mark && typeof mark === 'object' ? (mark as { type?: unknown }).type : undefined;
        if (isNoteMark(type) && !kept.includes(type)) kept.push(type);
      }
    }
    kept.sort((a, b) => NOTE_MARKS.indexOf(a) - NOTE_MARKS.indexOf(b));
    runs.push(
      kept.length > 0
        ? { type: 'text', text: clean, marks: kept.map((type) => ({ type })) }
        : { type: 'text', text: clean },
    );
  }
  return runs;
}

/** The note as plain text, for search, backups and the reference's hover text. */
export function noteText(content: NoteContent): string {
  return content.map((run) => run.text).join('');
}

/** A short form of the note for the hover text on a reference. */
export function notePreview(content: NoteContent, length = 80): string {
  const text = noteText(content).trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trimEnd()}…`;
}

/** The notes of an item as a plain-text list under a "Notes" line. Empty when the item has no notes. */
export function notesBlock(notes: readonly NoteContent[]): string {
  if (notes.length === 0) return '';
  const lines = notes.map((note, i) => `${String(i + 1)}. ${noteText(note)}`);
  return `Notes\n${lines.join('\n')}`;
}

/**
 * A plain-text copy without the notes block that `docText` adds at its end, for word counts that cover
 * the writing only, such as the counts in History.
 */
export function withoutNotes(text: string): string {
  if (text.startsWith('Notes\n1. ')) return '';
  const at = text.lastIndexOf('\n\nNotes\n1. ');
  return at < 0 ? text : text.slice(0, at);
}
