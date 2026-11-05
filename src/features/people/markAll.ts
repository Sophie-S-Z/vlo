import * as Y from 'yjs';
import { DOC_SCHEMA, docSchema, stampDocSchema } from '@/features/editor/docSchema';
import { sendToTabs } from '@/features/editor/tabSync';
import { TEMPLATES } from '@/features/library/templates';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import type { PrivatePerson } from '@/lib/privacy';
import { openItemDoc, YFRAGMENT } from '@/lib/ydocs';
import { personIdOf, PRIVATE_NAME } from './markName';

/*
 * "Mark all" (spec 8.2, plan Task C5 and Review Focus 1). It reads the Yjs text of each item and marks
 * every exact whole-word match of each real name that has no mark yet, longest name first. The marks go
 * into the stored text and to each open editor, so the writer sees them at once.
 */

/** True for a letter or a digit in any script, so "Rosa" never matches inside "Rosalind". */
const WORD = /[\p{L}\p{N}]/u;
/** Stands in for an inline object in a text, so a name never crosses it. */
const OBJECT = '￼';

interface TextPart {
  text: Y.XmlText;
  /** The characters of the text, with one OBJECT for each inline object. */
  chars: string;
  /** The person id of the private-name mark at each character, or null. */
  marks: (string | null)[];
}

type Delta = { insert: unknown; attributes?: Record<string, unknown> }[];

function textsOf(node: Y.XmlFragment | Y.XmlElement, out: Y.XmlText[]): Y.XmlText[] {
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) out.push(child);
    else if (child instanceof Y.XmlElement) textsOf(child, out);
  }
  return out;
}

function partsOf(doc: Y.Doc): TextPart[] {
  return textsOf(doc.getXmlFragment(YFRAGMENT), []).map((text) => {
    let chars = '';
    let marks: (string | null)[] = [];
    for (const d of text.toDelta() as Delta) {
      const piece = typeof d.insert === 'string' ? d.insert : OBJECT;
      const value = d.attributes?.[PRIVATE_NAME];
      const person = value === undefined ? null : (personIdOf(value as Record<string, unknown> | null) ?? '');
      chars += piece;
      // One entry for each UTF-16 unit, so the marks line up with the string positions.
      marks = marks.concat(new Array<string | null>(piece.length).fill(person));
    }
    return { text, chars, marks };
  });
}

interface Target {
  real: string;
  personId: string;
}

/** Each real name with its person, longest first. */
function targetsOf(people: readonly PrivatePerson[]): Target[] {
  return people
    .flatMap((p) => p.variants.map((v) => ({ real: v.real.trim(), personId: p.id })))
    .filter((t) => t.real !== '')
    .sort((a, b) => b.real.length - a.real.length);
}

/** The unmarked whole-word matches in one text, without overlaps. */
function matchesIn(
  part: TextPart,
  targets: readonly Target[],
): { from: number; to: number; target: Target }[] {
  const found: { from: number; to: number; target: Target }[] = [];
  for (const target of targets) {
    let from = part.chars.indexOf(target.real);
    while (from !== -1) {
      const to = from + target.real.length;
      const whole = !WORD.test(part.chars[from - 1] ?? '') && !WORD.test(part.chars[to] ?? '');
      const unmarked = part.marks.slice(from, to).every((m) => m === null);
      const free = found.every((m) => to <= m.from || from >= m.to);
      if (whole && unmarked && free) found.push({ from, to, target });
      from = part.chars.indexOf(target.real, from + 1);
    }
  }
  return found.sort((a, b) => a.from - b.from);
}

/** Marks every unmarked real name in the document. Returns how many names it marked. */
export function markNames(doc: Y.Doc, people: readonly PrivatePerson[]): number {
  const targets = targetsOf(people);
  if (targets.length === 0) return 0;
  const work = partsOf(doc).map((part) => ({ part, found: matchesIn(part, targets) }));
  const count = work.reduce((n, w) => n + w.found.length, 0);
  if (count === 0) return 0;
  doc.transact(() => {
    for (const { part, found } of work) {
      for (const m of found) {
        part.text.format(m.from, m.to - m.from, { [PRIVATE_NAME]: { personId: m.target.personId } });
      }
    }
    stampDocSchema(doc);
  });
  return count;
}

export interface NameScan {
  /** Marked names by person id. Names next to each other with the same person count once. */
  marked: Map<string, number>;
  /** Unmarked matches by real name. */
  unmarked: Map<string, number>;
}

/** Counts the marked names and the unmarked real names in a document. */
export function scanNames(doc: Y.Doc, people: readonly PrivatePerson[], into?: NameScan): NameScan {
  const scan: NameScan = into ?? { marked: new Map(), unmarked: new Map() };
  const targets = targetsOf(people);
  for (const part of partsOf(doc)) {
    part.marks.forEach((person, i) => {
      if (person !== null && person !== '' && person !== part.marks[i - 1]) {
        scan.marked.set(person, (scan.marked.get(person) ?? 0) + 1);
      }
    });
    for (const m of matchesIn(part, targets)) {
      scan.unmarked.set(m.target.real, (scan.unmarked.get(m.target.real) ?? 0) + 1);
    }
  }
  return scan;
}

/**
 * The update with each private-name mark pointing to a new person id, for a backup imported as a copy.
 * A mark whose person `personId` does not know goes, because its old id names no person in the copy.
 */
export function remapNameMarks(update: Uint8Array, personId: (old: string) => string | null): Uint8Array {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, update);
    const result = { changed: false };
    doc.transact(() => {
      for (const text of textsOf(doc.getXmlFragment(YFRAGMENT), [])) {
        let at = 0;
        for (const d of text.toDelta() as Delta) {
          const length = typeof d.insert === 'string' ? d.insert.length : 1;
          const value = d.attributes?.[PRIVATE_NAME];
          if (value !== undefined) {
            const old = personIdOf(value as Record<string, unknown> | null);
            const next = old === null ? null : personId(old);
            text.format(at, length, { [PRIVATE_NAME]: next === null ? null : { personId: next } });
            result.changed = true;
          }
          at += length;
        }
      }
    });
    return result.changed ? Y.encodeStateAsUpdate(doc) : update;
  } finally {
    doc.destroy();
  }
}

/** Items read at the same time, so a long book does not open hundreds of databases at once. */
const AT_ONCE = 6;

/** The ids of the project's items that have text. */
async function textItems(projectId: string): Promise<string[]> {
  const project = await db.projects.get(projectId);
  if (!project) return [];
  const template = TEMPLATES[project.template];
  const items = await db.items.where('projectId').equals(projectId).toArray();
  return items.filter((i) => template.editorKind(i.kind) !== null).map((i) => i.id);
}

/** Runs `step` on the open document of each item, a few at a time. */
async function eachDoc(
  ids: readonly string[],
  step: (id: string, doc: Y.Doc) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < ids.length; i += AT_ONCE) {
    await Promise.all(
      ids.slice(i, i + AT_ONCE).map(async (id) => {
        const open = openItemDoc(id);
        try {
          await open.ready;
          // A newer Vlo saved this item. This build leaves it as it is.
          if (docSchema(open.doc) > DOC_SCHEMA) return;
          await step(id, open.doc);
          await open.confirmSaved(clock.now());
        } finally {
          await open.close();
        }
      }),
    );
  }
}

/**
 * Marks every unmarked real name in the project's text. Each editor that has the item open gets the marks
 * at once. Returns how many names it marked and in how many items.
 */
export async function markAllInProject(
  projectId: string,
  people: readonly PrivatePerson[],
): Promise<{ names: number; items: number }> {
  let names = 0;
  let items = 0;
  await eachDoc(await textItems(projectId), (id, doc) => {
    const updates: Uint8Array[] = [];
    const keep = (update: Uint8Array) => {
      updates.push(update);
    };
    doc.on('update', keep);
    const count = markNames(doc, people);
    doc.off('update', keep);
    if (count > 0) {
      names += count;
      items += 1;
      sendToTabs(id, Y.mergeUpdates(updates));
    }
    return Promise.resolve();
  });
  if (names > 0) await db.projects.update(projectId, { updatedAt: clock.now() });
  return { names, items };
}

/** Counts the marked and unmarked names in the whole project. */
export async function scanProject(projectId: string, people: readonly PrivatePerson[]): Promise<NameScan> {
  const scan: NameScan = { marked: new Map(), unmarked: new Map() };
  const ids = await textItems(projectId);
  for (let i = 0; i < ids.length; i += AT_ONCE) {
    await Promise.all(
      ids.slice(i, i + AT_ONCE).map(async (id) => {
        const open = openItemDoc(id);
        try {
          await open.ready;
          scanNames(open.doc, people, scan);
        } finally {
          await open.close();
        }
      }),
    );
  }
  return scan;
}
