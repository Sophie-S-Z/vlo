import { Editor } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DOC_SCHEMA, docSchema } from '@/features/editor/docSchema';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { updateToJson } from '@/features/export/read';
import { createProject } from '@/features/library/projects';
import { markAllInProject, markNames, remapNameMarks, scanNames } from '@/features/people/markAll';
import {
  addPerson,
  cleanVariants,
  deletePerson,
  privatePeople,
  restorePerson,
  sortPeople,
  updatePerson,
} from '@/features/people/people';
import { db } from '@/lib/db';
import type { PrivatePerson } from '@/lib/privacy';
import { docFromUpdate, readItemUpdate, writeItemUpdate, YFRAGMENT } from '@/lib/ydocs';
import { MEMOIR_TEXT, poemUpdate, proseUpdate } from './export-fixtures';

/* People and private names (spec 8.2, plan Task C5, Review Focus 1 and 2). */

const PEOPLE: PrivatePerson[] = [
  {
    id: 'rosa',
    variants: [
      { real: 'Aunt Rosa', alias: 'Aunt Maria' },
      { real: 'Rosa', alias: 'Maria' },
    ],
  },
  {
    id: 'teo',
    variants: [
      { real: 'Uncle Teo', alias: 'Uncle Sam' },
      { real: 'Teo', alias: 'Sam' },
    ],
  },
];

const MEMOIR = MEMOIR_TEXT.trim().split('\n');

interface JsonNode {
  text?: string;
  marks?: { type: string; attrs?: { personId?: string } }[];
  content?: JsonNode[];
}

/** The marked names of a document as [text, person id] pairs, in text order. */
function marked(doc: Y.Doc): [string, string][] {
  const out: [string, string][] = [];
  const walk = (node: JsonNode) => {
    // Marked text next to marked text of the same person is one name in two styles.
    let previous: string | null = null;
    for (const child of node.content ?? []) {
      const person = child.marks?.find((m) => m.type === 'privateName')?.attrs?.personId ?? null;
      const last = out[out.length - 1];
      if (child.text !== undefined && person !== null) {
        if (last && previous === person) last[0] += child.text;
        else out.push([child.text, person]);
      }
      previous = child.text === undefined ? null : person;
      walk(child);
    }
  };
  walk(updateToJson(Y.encodeStateAsUpdate(doc)));
  return out;
}

describe('the person list', () => {
  test('trims each name, drops empty rows, and refuses a bad row', () => {
    expect(
      cleanVariants(
        [
          { real: ' Rosa ', alias: ' Maria ' },
          { real: '', alias: '' },
        ],
        new Set(),
      ),
    ).toEqual([{ real: 'Rosa', alias: 'Maria' }]);
    expect(() => cleanVariants([{ real: 'Rosa', alias: '' }], new Set())).toThrow('Type an alias for Rosa.');
    expect(() => cleanVariants([{ real: '', alias: 'Maria' }], new Set())).toThrow(
      'Type the real name for the alias Maria.',
    );
    expect(() => cleanVariants([{ real: 'Rosa', alias: 'Rosa' }], new Set())).toThrow(
      'must be a different name',
    );
    expect(() =>
      cleanVariants(
        [
          { real: 'Rosa', alias: 'Maria' },
          { real: 'Rosa', alias: 'Mae' },
        ],
        new Set(),
      ),
    ).toThrow('Rosa is in the list two times.');
    expect(() => cleanVariants([{ real: 'Rosa', alias: 'Maria' }], new Set(['Rosa']))).toThrow(
      'Rosa is a name of another person in this project.',
    );
    expect(() => cleanVariants([], new Set())).toThrow('Type a real name and its alias.');
  });
});

describe('people in the database', () => {
  beforeEach(async () => {
    await db.open();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: () => Promise.resolve(true) },
    });
  });
  afterEach(async () => {
    Reflect.deleteProperty(navigator, 'storage');
    await db.delete();
  });

  test('privatePeople gives the stored people of one project, and a failed read throws', async () => {
    const { project } = await createProject({ title: 'Salt Kitchen', templates: ['memoir'] });
    const { project: other } = await createProject({ title: 'Other', templates: ['memoir'] });
    const rosa = await addPerson(project.id, '', [{ real: 'Rosa', alias: 'Maria' }]);
    await addPerson(other.id, '', [{ real: 'Teo', alias: 'Sam' }]);
    expect(await privatePeople(project.id)).toEqual([{ id: rosa.id, variants: rosa.variants }]);
    // An outgoing copy must never go without its aliases, so no empty list stands in for a failed read.
    db.close();
    await expect(privatePeople(project.id)).rejects.toThrow();
  });

  test('add, change, delete with undo, and one person for each real name', async () => {
    const { project } = await createProject({ title: 'Salt Kitchen', templates: ['memoir'] });
    const rosa = await addPerson(project.id, '', [
      { real: 'Aunt Rosa', alias: 'Aunt Maria' },
      { real: 'Rosa', alias: 'Maria' },
    ]);
    expect(rosa.label).toBe('Aunt Rosa');
    const teo = await addPerson(project.id, 'My uncle', [{ real: 'Teo', alias: 'Sam' }]);
    await expect(addPerson(project.id, '', [{ real: 'Rosa', alias: 'Ana' }])).rejects.toThrow(
      'Rosa is a name of another person in this project.',
    );
    await updatePerson(teo.id, {
      variants: [
        { real: 'Teo', alias: 'Sam' },
        { real: 'Uncle Teo', alias: 'Uncle Sam' },
      ],
    });
    // A person may keep its own names in a change.
    await updatePerson(rosa.id, { label: 'Rosa', variants: rosa.variants });
    const people = sortPeople(await db.people.where('projectId').equals(project.id).toArray());
    expect(people.map((p) => [p.label, p.variants.length])).toEqual([
      ['My uncle', 2],
      ['Rosa', 2],
    ]);
    const deleted = await deletePerson(rosa.id);
    expect(await db.people.get(rosa.id)).toBeUndefined();
    if (!deleted) throw new Error('No deleted person.');
    await restorePerson(deleted);
    expect((await db.people.get(rosa.id))?.label).toBe('Rosa');
  });

  test('undo keeps a name that another person took in the meantime with that person', async () => {
    const { project } = await createProject({ title: 'Salt Kitchen', templates: ['memoir'] });
    const rosa = await addPerson(project.id, '', [
      { real: 'Aunt Rosa', alias: 'Aunt Maria' },
      { real: 'Rosa', alias: 'Maria' },
    ]);
    const deleted = await deletePerson(rosa.id);
    if (!deleted) throw new Error('No deleted person.');
    await addPerson(project.id, 'Cousin', [{ real: 'Rosa', alias: 'Ana' }]);
    expect(await restorePerson(deleted)).toEqual(['Rosa']);
    expect((await db.people.get(rosa.id))?.variants).toEqual([{ real: 'Aunt Rosa', alias: 'Aunt Maria' }]);
    // With each name taken, the undo stops and says why.
    const again = await deletePerson(rosa.id);
    if (!again) throw new Error('No deleted person.');
    await addPerson(project.id, 'Aunt', [{ real: 'Aunt Rosa', alias: 'Aunt Ana' }]);
    await expect(restorePerson(again)).rejects.toThrow(
      'Another person in this project has each name of Aunt Rosa now.',
    );
    expect(await db.people.get(rosa.id)).toBeUndefined();
  });

  test('Mark all marks the stored text of each item and sends the marks to open editors', async () => {
    const { project } = await createProject({ title: 'Salt Kitchen', templates: ['memoir'] });
    const memory = (await db.items.where('projectId').equals(project.id).toArray()).find(
      (i) => i.kind === 'memory',
    );
    if (!memory) throw new Error('The memoir starter has no memory.');
    const text = proseUpdate(MEMOIR);
    await writeItemUpdate(memory.id, text, 1);
    const channel = new BroadcastChannel(`vlo-item-${memory.id}-s${String(DOC_SCHEMA)}`);
    const sent = new Promise<Uint8Array>((resolve) => {
      channel.onmessage = (event: MessageEvent<{ update: Uint8Array }>) => {
        resolve(event.data.update);
      };
    });
    expect(await markAllInProject(project.id, PEOPLE)).toEqual({ names: 4, items: 1 });
    const stored = docFromUpdate(await readItemUpdate(memory.id));
    expect(marked(stored)).toEqual([
      ['Aunt Rosa', 'rosa'],
      ['Uncle Teo', 'teo'],
      ['Rosa', 'rosa'],
      ['Teo', 'teo'],
    ]);
    // The open editor's copy gets the same marks.
    const open = docFromUpdate(text);
    Y.applyUpdate(open, await sent);
    channel.close();
    expect(marked(open)).toHaveLength(4);
    expect(await markAllInProject(project.id, PEOPLE)).toEqual({ names: 0, items: 0 });
  });
});

describe('marks in the Yjs text', () => {
  test('Mark all marks whole words only, longest name first, and stamps the schema', () => {
    const doc = docFromUpdate(
      proseUpdate(['Rosalind met Aunt Rosa. Teodora met Teo, and Rosa’s cup stayed.', ...MEMOIR]),
    );
    expect(markNames(doc, PEOPLE)).toBe(7);
    expect(marked(doc).slice(0, 3)).toEqual([
      ['Aunt Rosa', 'rosa'],
      ['Teo', 'teo'],
      ['Rosa', 'rosa'],
    ]);
    expect(docSchema(doc)).toBe(DOC_SCHEMA);
    // A second run finds nothing new.
    expect(markNames(doc, PEOPLE)).toBe(0);
    expect(scanNames(doc, PEOPLE)).toEqual({
      marked: new Map([
        ['rosa', 4],
        ['teo', 3],
      ]),
      unmarked: new Map(),
    });
  });

  test('Mark all finds a name with a curly apostrophe or a no-break space, as the export does', () => {
    const people: PrivatePerson[] = [
      { id: 'b', variants: [{ real: "O'Brien", alias: 'Kane' }] },
      { id: 'u', variants: [{ real: 'Uncle Teo', alias: 'Uncle Sol' }] },
    ];
    const doc = docFromUpdate(proseUpdate(['O’Brien met Uncle\u00A0Teo at the shore.']));
    expect(markNames(doc, people)).toBe(2);
    expect(marked(doc)).toEqual([
      ['O’Brien', 'b'],
      ['Uncle\u00A0Teo', 'u'],
    ]);
    expect(scanNames(doc, people).unmarked).toEqual(new Map());
  });

  test('the scan counts the unmarked names', () => {
    const doc = docFromUpdate(proseUpdate(MEMOIR));
    expect(scanNames(doc, PEOPLE).unmarked).toEqual(
      new Map([
        ['Aunt Rosa', 1],
        ['Uncle Teo', 1],
        ['Rosa', 1],
        ['Teo', 1],
      ]),
    );
  });

  test('a copy points each mark to the new person and drops a mark with no person', () => {
    const doc = docFromUpdate(proseUpdate(MEMOIR));
    markNames(doc, PEOPLE);
    const copy = docFromUpdate(
      remapNameMarks(Y.encodeStateAsUpdate(doc), (old) => (old === 'rosa' ? 'rosa-2' : null)),
    );
    expect(marked(copy)).toEqual([
      ['Aunt Rosa', 'rosa-2'],
      ['Rosa', 'rosa-2'],
    ]);
    const plain = proseUpdate(['No names here.']);
    expect(remapNameMarks(plain, () => null)).toBe(plain);
  });

  test('poem lines keep every space around a marked name', () => {
    const doc = docFromUpdate(poemUpdate('    for Rosa,   at the  shore\n'));
    expect(markNames(doc, PEOPLE)).toBe(1);
    const json = JSON.stringify(updateToJson(Y.encodeStateAsUpdate(doc)));
    expect(json).toContain('"text":"    for "');
    expect(json).toContain('"text":",   at the  shore"');
  });
});

describe('a marked name in the editor (Review Focus 2)', () => {
  let editor: Editor;
  let ydoc: Y.Doc;

  function mount(kind: 'prose' | 'poem', doc: Y.Doc) {
    ydoc = doc;
    editor = new Editor({
      element: document.createElement('div'),
      extensions: kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc),
    });
  }

  afterEach(() => {
    editor.destroy();
  });

  /** The position of `text` in the editor document. */
  function posOf(text: string): number {
    let found = -1;
    editor.state.doc.descendants((node, pos) => {
      if (found !== -1 || !node.isText) return;
      const index = node.text?.indexOf(text) ?? -1;
      if (index !== -1) found = pos + index;
    });
    return found;
  }

  function type(text: string, at: number) {
    editor.view.dispatch(editor.state.tr.insertText(text, at));
  }

  test('typing inside a name keeps the mark on the whole name, and typing after it does not', () => {
    mount('prose', docFromUpdate(proseUpdate(['Rosa came home.'])));
    const from = posOf('Rosa');
    editor
      .chain()
      .setTextSelection({ from, to: from + 4 })
      .setPrivateName('rosa')
      .run();
    type('-', from + 2);
    type('s', from + 5);
    expect(marked(ydoc)).toEqual([['Ro-sa', 'rosa']]);
  });

  test('the mark survives a reload, a clear of the formats and a snapshot restore', () => {
    mount('prose', docFromUpdate(proseUpdate(['Dear Rosa.'])));
    const from = posOf('Rosa');
    editor
      .chain()
      .setTextSelection({ from, to: from + 4 })
      .toggleBold()
      .setPrivateName('rosa')
      .run();
    editor.chain().setTextSelection({ from: 1, to: 11 }).clearFormatting().run();
    expect(editor.isActive('bold')).toBe(false);
    const state = Y.encodeStateAsUpdate(ydoc);
    editor.destroy();

    // A reload reads the stored state into a new editor.
    mount('prose', docFromUpdate(state));
    expect(marked(ydoc)).toEqual([['Rosa', 'rosa']]);
    expect(editor.getHTML()).toContain('<span class="vlo-name" data-person="rosa">Rosa</span>');

    // A restore reads a snapshot's state through the editor schema.
    editor.commands.setContent('<p>Other text.</p>');
    const old = docFromUpdate(state);
    editor.commands.setContent(
      yXmlFragmentToProseMirrorRootNode(old.getXmlFragment(YFRAGMENT), editor.schema),
    );
    expect(marked(ydoc)).toEqual([['Rosa', 'rosa']]);

    editor
      .chain()
      .setTextSelection(posOf('Rosa') + 1)
      .unsetPrivateName()
      .run();
    expect(marked(ydoc)).toEqual([]);
  });

  test('a poem keeps the mark and its spaces', () => {
    mount('poem', docFromUpdate(poemUpdate('    for Rosa,   at the  shore\n')));
    const from = posOf('Rosa');
    editor
      .chain()
      .setTextSelection({ from, to: from + 4 })
      .setPrivateName('rosa')
      .run();
    expect(marked(ydoc)).toEqual([['Rosa', 'rosa']]);
    expect(editor.state.doc.textContent).toBe('    for Rosa,   at the  shore');
  });
});
