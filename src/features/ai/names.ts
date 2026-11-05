import type { JSONContent } from '@tiptap/core';
import { personIdOf, PRIVATE_NAME } from '@/features/people/markName';
import { namePreview, type PrivatePerson } from '@/lib/privacy';

/*
 * The private names that the writer marked in the text (spec 8.2, Gate 4). A marked name can be a word
 * that no variant on the People screen lists, such as "Gran" marked as Rosa. A memoir AI request goes as
 * plain text, so each marked text becomes one more variant of its person for that request, with the alias
 * that a share-safe export would print.
 */

export interface MarkedName {
  personId: string;
  text: string;
}

/** Each marked name in a document, in order. Next text nodes with the same person make one name. */
export function markedNamesIn(doc: JSONContent): MarkedName[] {
  const out: MarkedName[] = [];
  const visit = (node: JSONContent) => {
    let current = null as MarkedName | null;
    for (const child of node.content ?? []) {
      if (child.type === 'text' && typeof child.text === 'string') {
        const mark = child.marks?.find((m) => m.type === PRIVATE_NAME);
        const personId = mark ? personIdOf(mark.attrs) : null;
        if (personId !== null && current?.personId === personId) current.text += child.text;
        else {
          if (current) out.push(current);
          current = personId === null ? null : { personId, text: child.text };
        }
        continue;
      }
      if (current) out.push(current);
      current = null;
      visit(child);
    }
    if (current) out.push(current);
  };
  visit(doc);
  return out;
}

/** The people with each marked text as one more variant, with the alias that share-safe export prints. */
export function withMarkedNames(
  people: readonly PrivatePerson[],
  marked: readonly MarkedName[],
): PrivatePerson[] {
  const preview = namePreview(people);
  return people.map((person) => {
    const known = new Set(person.variants.map((v) => v.real.trim()));
    const extra = new Map<string, string>();
    for (const name of marked) {
      const text = name.text.trim();
      if (name.personId !== person.id || text === '' || known.has(text) || extra.has(text)) continue;
      const alias = preview.marked(text, person.id);
      if (alias !== null && alias !== '') extra.set(text, alias);
    }
    return {
      ...person,
      variants: [...person.variants, ...[...extra].map(([real, alias]) => ({ real, alias }))],
    };
  });
}
