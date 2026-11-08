import { useLiveQuery } from 'dexie-react-hooks';
import { clock } from '@/lib/clock';
import { db, type Person } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { NameVariant, PrivatePerson } from '@/lib/privacy';

/*
 * The people of a memoir (spec 8.2, plan Task C5). Each person has a label and the ways the text names
 * them, each with an alias. Each change also marks the project as changed, for the Library order, the
 * backup reminder and folder save.
 */

export const MAX_LABEL = 80;
export const MAX_NAME = 80;

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** People in label order. */
export function sortPeople(people: readonly Person[]): Person[] {
  return [...people].sort((a, b) => collator.compare(a.label, b.label) || a.id.localeCompare(b.id));
}

/** The people of a project, in label order, live. Undefined while they load. */
export function usePeople(projectId: string): Person[] | undefined {
  return useLiveQuery(
    async () => sortPeople(await db.people.where('projectId').equals(projectId).toArray()),
    [projectId],
  );
}

/**
 * The people of a project as stored now, for a copy that leaves the writer's text: an export, a share
 * link, an AI request or a web search. A list that a component holds can be a step behind, such as just
 * after the writer adds a person. A failed read throws, so nothing goes out without its aliases.
 */
export async function privatePeople(projectId: string): Promise<PrivatePerson[]> {
  const people = await db.people.where('projectId').equals(projectId).toArray();
  return people.map((p) => ({ id: p.id, variants: p.variants }));
}

/**
 * The variants with spaces trimmed. A real name and its alias must both have text, must differ, and a
 * real name must not repeat in the project, because each real name finds one person.
 */
export function cleanVariants(variants: readonly NameVariant[], taken: ReadonlySet<string>): NameVariant[] {
  const out: NameVariant[] = [];
  const seen = new Set<string>();
  for (const raw of variants) {
    const real = raw.real.trim();
    const alias = raw.alias.trim();
    if (real === '' && alias === '') continue;
    if (real === '') throw new RangeError(`Type the real name for the alias ${alias}.`);
    if (alias === '') throw new RangeError(`Type an alias for ${real}.`);
    if (real.length > MAX_NAME || alias.length > MAX_NAME)
      throw new RangeError(`A name can have up to ${String(MAX_NAME)} characters.`);
    if (real === alias) throw new RangeError(`The alias for ${real} must be a different name.`);
    if (seen.has(real)) throw new RangeError(`${real} is in the list two times.`);
    if (taken.has(real)) throw new RangeError(`${real} is a name of another person in this project.`);
    seen.add(real);
    out.push({ real, alias });
  }
  if (out.length === 0) throw new RangeError('Type a real name and its alias.');
  return out;
}

function cleanLabel(label: string, variants: readonly NameVariant[]): string {
  const typed = label.trim();
  const trimmed = typed === '' ? (variants[0]?.real ?? '') : typed;
  if (trimmed.length > MAX_LABEL)
    throw new RangeError(`A label can have up to ${String(MAX_LABEL)} characters.`);
  return trimmed;
}

/** The real names of the project's other people. */
async function takenNames(projectId: string, except: string | null): Promise<Set<string>> {
  const people = await db.people.where('projectId').equals(projectId).toArray();
  return new Set(people.filter((p) => p.id !== except).flatMap((p) => p.variants.map((v) => v.real)));
}

async function touch(projectId: string): Promise<void> {
  await db.projects.update(projectId, { updatedAt: clock.now() });
}

/** Adds a person. An empty label takes the first real name. */
export async function addPerson(
  projectId: string,
  label: string,
  variants: readonly NameVariant[],
): Promise<Person> {
  return db.transaction('rw', db.people, db.projects, async () => {
    const clean = cleanVariants(variants, await takenNames(projectId, null));
    const person: Person = { id: newId(), projectId, label: cleanLabel(label, clean), variants: clean };
    await db.people.add(person);
    await touch(projectId);
    return person;
  });
}

export async function updatePerson(
  id: string,
  patch: { label?: string; variants?: readonly NameVariant[] },
): Promise<void> {
  await db.transaction('rw', db.people, db.projects, async () => {
    const person = await db.people.get(id);
    if (!person) return;
    const variants =
      patch.variants === undefined
        ? person.variants
        : cleanVariants(patch.variants, await takenNames(person.projectId, id));
    const label = patch.label === undefined ? person.label : cleanLabel(patch.label, variants);
    await db.people.update(id, { label, variants });
    await touch(person.projectId);
  });
}

/**
 * Deletes a person and returns the row, for Undo. The marks in the text stay: with no person they do
 * nothing, so a share-safe export swaps their text only where it matches another real name.
 */
export async function deletePerson(id: string): Promise<Person | undefined> {
  return db.transaction('rw', db.people, db.projects, async () => {
    const person = await db.people.get(id);
    if (!person) return undefined;
    await db.people.delete(id);
    await touch(person.projectId);
    return person;
  });
}

/** Puts a deleted person back with the same id, so the marks in the text find the person again. */
/**
 * Puts a deleted person back. A real name that another person took in the meantime stays with that
 * person, so two people never share a name. Returns the names that did not come back.
 */
export async function restorePerson(person: Person): Promise<string[]> {
  return db.transaction('rw', db.people, db.projects, async () => {
    const taken = await takenNames(person.projectId, person.id);
    const variants = person.variants.filter((v) => !taken.has(v.real));
    if (variants.length === 0) {
      throw new RangeError(`Another person in this project has each name of ${person.label} now.`);
    }
    await db.people.put({ ...person, variants });
    await touch(person.projectId);
    return person.variants.filter((v) => taken.has(v.real)).map((v) => v.real);
  });
}
