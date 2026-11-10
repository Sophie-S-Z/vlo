import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resetSources, setSources } from '@/features/cite/sourceStore';
import { inText } from '@/features/cite/styles';
import { command, commandsFor } from '@/features/editor/commands/registry';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { docText } from '@/features/editor/itemText';
import type { Source } from '@/lib/db';

/* Roadmap 2 F64, plan Task M6, Review Focus 4: a citation in the text. */

const MARLOW: Source = {
  id: 'src1',
  projectId: 'p1',
  key: 'marlow2019',
  type: 'book',
  authors: [
    { family: 'Marlow', given: 'Ada' },
    { family: 'Quill', given: 'Jonah' },
  ],
  title: 'Night Ferry',
  publisher: 'Harbour Press',
  year: '2019',
};

const editors: Editor[] = [];
function mount(doc = new Y.Doc()) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor({ element: host, extensions: proseExtensions(doc) });
  editors.push(editor);
  return editor;
}

function clipboard(data: Record<string, string>): ClipboardEvent {
  return Object.assign(new Event('paste', { cancelable: true }), {
    clipboardData: { getData: (type: string) => data[type] ?? '' },
  }) as unknown as ClipboardEvent;
}

const cites = (e: Editor) => [...e.view.dom.querySelectorAll('.vlo-cite')].map((el) => el.textContent);
const attrs = (e: Editor) => {
  const found: unknown[] = [];
  e.state.doc.descendants((node) => {
    if (node.type.name === 'cite') found.push(node.attrs);
  });
  return found;
};

beforeEach(() => {
  setSources('p1', [MARLOW], 'apa');
});
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  resetSources();
});

describe('Citations', () => {
  test('"Cite a source" puts an atom with the key and the page at the cursor', () => {
    const e = mount();
    e.commands.setContent('<p>The crossing took a night.</p>');
    e.commands.setTextSelection(27);
    e.commands.insertCitation('marlow2019', ' 12 ');
    expect(attrs(e)).toEqual([{ key: 'marlow2019', page: '12' }]);
    expect(docText(e.state.doc, 'prose')).toBe('The crossing took a night.[@marlow2019, 12]');
    // Open writing and memoir offer it in the / menu. A novel and a poem do not.
    expect(command('cite').slash).toBe(true);
    expect(commandsFor('prose', ['open']).some((c) => c.id === 'cite')).toBe(true);
    expect(commandsFor('prose', ['memoir']).some((c) => c.id === 'cite')).toBe(true);
    expect(commandsFor('prose', ['novel']).some((c) => c.id === 'cite')).toBe(false);
    expect(commandsFor('poem', ['open']).some((c) => c.id === 'cite')).toBe(false);
  });

  test('the atom shows the in-text form of the project style, and follows a change of style', () => {
    const e = mount();
    e.commands.setContent('<p>A night.</p>');
    e.commands.insertCitation('marlow2019', '12-14');
    e.commands.insertCitation('marlow2019');
    expect(cites(e)).toEqual(['(Marlow & Quill, 2019, pp. 12–14)', '(Marlow & Quill, 2019)']);
    setSources('p1', [MARLOW], 'mla');
    expect(cites(e)).toEqual(['(Marlow and Quill 12–14)', '(Marlow and Quill)']);
    setSources('p1', [MARLOW], 'chicago');
    expect(cites(e)).toEqual(['(Marlow and Quill 2019, 12–14)', '(Marlow and Quill 2019)']);
  });

  test('a deleted source shows "[missing source]", and its citation and key stay in the text', () => {
    const e = mount();
    e.commands.setContent('<p>A night.</p>');
    e.commands.insertCitation('marlow2019', '12');
    setSources('p1', [], 'apa');
    expect(cites(e)).toEqual(['[missing source]']);
    expect(e.view.dom.querySelector('.vlo-cite-missing')).not.toBeNull();
    expect(attrs(e)).toEqual([{ key: 'marlow2019', page: '12' }]);
    // Undo of the delete gives the source back, and the citation shows it again.
    setSources('p1', [MARLOW], 'apa');
    expect(cites(e)).toEqual(['(Marlow & Quill, 2019, p. 12)']);
  });

  test('a copy and a paste into another item keep the atom', () => {
    const from = mount();
    from.commands.setContent('<p>A night.</p>');
    from.commands.insertCitation('marlow2019', '12');
    from.commands.selectAll();
    const { dom, text } = from.view.serializeForClipboard(from.state.selection.content());
    expect(text).toContain('[@marlow2019, 12]');

    const to = mount();
    to.commands.setContent('<p>Morning.</p>');
    to.commands.setTextSelection(to.state.doc.content.size - 1);
    to.view.pasteHTML(dom.innerHTML, clipboard({ 'text/html': dom.innerHTML, 'text/plain': text }));
    expect(attrs(to)).toEqual([{ key: 'marlow2019', page: '12' }]);
    expect(cites(to)).toEqual(['(Marlow & Quill, 2019, p. 12)']);
  });

  test('the atom survives a save and a reload of the item text', () => {
    const doc = new Y.Doc();
    const first = mount(doc);
    first.commands.setContent('<p>A night.</p>');
    first.commands.insertCitation('marlow2019', '12');
    const saved = new Y.Doc();
    Y.applyUpdate(saved, Y.encodeStateAsUpdate(doc));
    expect(attrs(mount(saved))).toEqual([{ key: 'marlow2019', page: '12' }]);
  });
});

describe('In-text forms', () => {
  const one = { ...MARLOW, authors: [{ family: 'Osei', given: 'Kwame' }] };
  const many = { ...MARLOW, authors: [...MARLOW.authors, { family: 'Hale', given: 'Mina' }] };
  const undated: Source = {
    id: 'src2',
    projectId: 'p1',
    key: 'board',
    type: 'web',
    authors: [],
    title: 'Ferry Timetables',
  };

  test('one author, three or more authors, and a work with no author or date', () => {
    expect(inText(one, '', 'apa')).toBe('(Osei, 2019)');
    expect(inText(many, '7', 'apa')).toBe('(Marlow et al., 2019, p. 7)');
    expect(inText(many, '7', 'mla')).toBe('(Marlow et al. 7)');
    expect(inText(many, '7', 'chicago')).toBe('(Marlow et al. 2019, 7)');
    // APA sets a web page title in italics, which the text of a citation cannot hold, and an article's
    // title in quotation marks, with the comma inside them.
    expect(inText(undated, '', 'apa')).toBe('(Ferry Timetables, n.d.)');
    expect(inText({ ...undated, type: 'article' }, '', 'apa')).toBe('(“Ferry Timetables,” n.d.)');
    expect(inText(undated, '', 'mla')).toBe('(“Ferry Timetables”)');
    expect(inText(undated, '', 'chicago')).toBe('(“Ferry Timetables” n.d.)');
    expect(inText(undefined, '', 'apa')).toBe('[missing source]');
  });
});
