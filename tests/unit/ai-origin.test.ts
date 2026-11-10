import { Editor, type JSONContent } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { draftBlocks, findTarget, insertAiText, KEEP_AI_MARKS } from '@/features/editor/extensions/aiOrigin';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { AI_ORIGIN, aiLabelOf, aiOriginOf, type AiOrigin } from '@/features/editor/format/aiOrigin';
import { prepareExport, type ExportRequest } from '@/features/export/run';
import { percent, provenanceOf } from '@/features/export/provenance';
import { runsText, type Block } from '@/features/export/model';
import { YFRAGMENT } from '@/lib/ydocs';
import { item, project, updateOf } from './export-fixtures';

/* Plan Task D6 (F26): the aiOrigin mark, Insert as one undo step, the writer's own words, and provenance. */

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

const ORIGIN: AiOrigin = { provider: 'Groq', model: 'llama-3.3-70b-versatile', createdAt: 1_790_000_000_000 };

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function mount(kind: 'prose' | 'poem', html: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const doc = new Y.Doc();
  const editor = new Editor({
    element: host,
    extensions: kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc),
  });
  editors.push(editor);
  editor.commands.setContent(html);
  return { editor, doc };
}

/** Each run of text with its AI model, or "" for the writer's own text. */
function runs(editor: Editor): [string, string][] {
  const out: [string, string][] = [];
  editor.state.doc.descendants((node) => {
    if (!node.isText) return true;
    const mark = node.marks.find((m) => m.type.name === AI_ORIGIN);
    out.push([node.text ?? '', mark ? aiLabelOf(mark.attrs) : '']);
    return false;
  });
  return out;
}

function posOf(editor: Editor, text: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1 || !node.isText) return;
    const index = node.text?.indexOf(text) ?? -1;
    if (index !== -1) found = pos + index;
  });
  return found;
}

describe('draft blocks', () => {
  test('splits prose on blank lines and joins the lines of a paragraph', () => {
    expect(draftBlocks('One\ntwo.\n\n\nThree.\r\n \r\nFour.\n', 'prose')).toEqual([
      ['One two.'],
      ['Three.'],
      ['Four.'],
    ]);
    expect(draftBlocks('  \n\n ', 'prose')).toEqual([]);
  });

  test('keeps the lines and the spaces of a poem', () => {
    expect(draftBlocks('a line\n    an indent\n\nnew stanza', 'poem')).toEqual([
      ['a line', '    an indent'],
      ['new stanza'],
    ]);
  });
});

describe('Insert (Co-writer)', () => {
  test('adds a sentence at the cursor with the mark, and one Undo removes all of it', () => {
    const { editor } = mount('prose', '<p>She waited. Then the door.</p>');
    editor.commands.setTextSelection(posOf(editor, ' Then'));
    // The writer's typing before the insert is a separate undo step.
    editor.view.dispatch(editor.state.tr.insertText(' Rain.'));
    expect(insertAiText(editor, ' The kettle sang.', ORIGIN, 'prose')).not.toBeNull();
    expect(editor.state.doc.textContent).toBe('She waited. Rain. The kettle sang. Then the door.');
    expect(runs(editor)).toEqual([
      ['She waited. Rain.', ''],
      [' The kettle sang.', 'Groq, llama-3.3-70b-versatile'],
      [' Then the door.', ''],
    ]);
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('She waited. Rain. Then the door.');
    editor.commands.redo();
    expect(editor.state.doc.textContent).toContain('The kettle sang.');
  });

  test('puts paragraphs in place of the selected words, and writes the origin into the Yjs text', () => {
    const { editor, doc } = mount('prose', '<p>Before old words after.</p>');
    const from = posOf(editor, 'old words');
    editor.commands.setTextSelection({ from, to: from + 'old words'.length });
    const range = insertAiText(editor, 'new one.\n\nA second paragraph', ORIGIN, 'prose');
    expect(
      (editor.getJSON() as JSONContent).content?.map((p) => p.content?.map((t) => t.text).join('')),
    ).toEqual(['Before new one.', 'A second paragraph after.']);
    // The cursor goes after the new words, so the next key press does not replace them.
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(range?.to);
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.doc.content.size - 1)).toBe(
      ' after.',
    );
    const xml = JSON.stringify(doc.getXmlFragment(YFRAGMENT).toJSON());
    expect(xml).toContain('llama-3.3-70b-versatile');
    expect(editor.getHTML()).toContain(
      '<span class="vlo-ai" data-ai-provider="Groq" data-ai-model="llama-3.3-70b-versatile" data-ai-at="1790000000000">new one.</span>',
    );
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('Before old words after.');
  });

  test('adds stanzas and lines to a poem, and keeps their spaces', () => {
    const { editor } = mount('poem', '<div data-stanza><p data-poem-line>first line</p></div>');
    editor.commands.setTextSelection(posOf(editor, 'line') + 4);
    insertAiText(editor, ' and more\n   indented\n\nnew stanza', ORIGIN, 'poem');
    const json = editor.getJSON() as JSONContent;
    expect(json.content).toHaveLength(2);
    const lines = (json.content ?? []).map((s) =>
      (s.content ?? []).map((l) => (l.content ?? []).map((t) => t.text ?? '').join('')),
    );
    expect(lines).toEqual([['first line and more', '   indented'], ['new stanza']]);
  });

  test('adds a space where a draft would join a word', () => {
    const { editor } = mount('prose', '<p>Rain.Then</p>');
    editor.commands.setTextSelection(posOf(editor, 'Then'));
    insertAiText(editor, 'The kettle sang.', ORIGIN, 'prose');
    expect(editor.state.doc.textContent).toBe('Rain. The kettle sang. Then');
  });

  test('a draft of paragraphs keeps a space after the last word at the cursor', () => {
    const { editor } = mount('prose', '<p>It rained.</p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const range = insertAiText(editor, 'She walked.\n\nHe stayed.', ORIGIN, 'prose');
    expect(
      (editor.getJSON() as JSONContent).content?.map((p) => p.content?.map((t) => t.text).join('')),
    ).toEqual(['It rained. She walked.', 'He stayed.']);
    expect(range && editor.state.doc.textBetween(range.from, range.to, '|')).toBe(' She walked.|He stayed.');
  });

  test('does nothing with an empty draft', () => {
    const { editor } = mount('prose', '<p>Text</p>');
    expect(insertAiText(editor, ' \n\n ', ORIGIN, 'prose')).toBeNull();
    expect(editor.state.doc.textContent).toBe('Text');
  });
});

describe('the words a rewrite replaces (architecture review finding 6)', () => {
  /** The target of `text` where it is now. */
  function targetOf(editor: Editor, text: string) {
    const from = posOf(editor, text);
    return { from, to: from + text.length, text };
  }

  test('keeps the range while the words are still there', () => {
    const { editor } = mount('prose', '<p>The gulls slept on the wall.</p>');
    const target = targetOf(editor, 'slept on');
    expect(findTarget(editor.state.doc, target, '\n\n')).toEqual(target);
  });

  test('finds the words again after text before them changed', () => {
    const { editor } = mount('prose', '<p>The gulls slept on the wall.</p><p>Rain.</p>');
    const target = targetOf(editor, 'Rain');
    editor.commands.insertContentAt(1, 'At dusk ');
    const found = findTarget(editor.state.doc, target, '\n\n');
    expect(found).toEqual(targetOf(editor, 'Rain'));
    expect(found?.from).not.toBe(target.from);
  });

  test('finds the words across a bold run', () => {
    const { editor } = mount('prose', '<p>The <strong>gulls</strong> slept.</p>');
    const target = { from: 1, to: 17, text: 'The gulls slept.' };
    editor.commands.insertContentAt(0, '<p>First.</p>');
    expect(findTarget(editor.state.doc, target, '\n\n')?.text).toBe('The gulls slept.');
  });

  test('gives null when the words are gone, match twice, or span two blocks that moved', () => {
    const { editor } = mount('prose', '<p>The gulls slept.</p><p>The tide came in.</p>');
    const gone = targetOf(editor, 'The gulls');
    const twice = { ...targetOf(editor, 'The'), from: 0 };
    const blocks = { from: 0, to: 0, text: 'slept.\n\nThe tide' };
    editor.commands.insertContentAt(1, 'At dusk ');
    editor.commands.insertContentAt(posOf(editor, 'gulls'), 'old ');
    expect(findTarget(editor.state.doc, gone, '\n\n')).toBeNull();
    expect(findTarget(editor.state.doc, twice, '\n\n')).toBeNull();
    expect(findTarget(editor.state.doc, blocks, '\n\n')).toBeNull();
  });
});

describe("the writer's own words", () => {
  test('typing inside and at the end of AI text is the writer’s, and the rest stays marked', () => {
    const { editor } = mount('prose', '<p>Start</p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    insertAiText(editor, ' the kettle sang', ORIGIN, 'prose');
    const inside = posOf(editor, 'sang');
    editor.view.dispatch(editor.state.tr.insertText('loudly ', inside));
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.view.dispatch(editor.state.tr.insertText('!'));
    expect(runs(editor)).toEqual([
      ['Start', ''],
      [' the kettle ', 'Groq, llama-3.3-70b-versatile'],
      ['loudly ', ''],
      ['sang', 'Groq, llama-3.3-70b-versatile'],
      ['!', ''],
    ]);
  });

  test('a replace inside AI text is the writer’s, and bold and Clear formatting keep the mark', () => {
    const { editor } = mount('prose', '<p></p>');
    insertAiText(editor, 'grey sea', ORIGIN, 'prose');
    const from = posOf(editor, 'grey');
    editor.view.dispatch(editor.state.tr.insertText('blue', from, from + 4));
    editor.chain().selectAll().toggleBold().clearFormatting().run();
    expect(runs(editor)).toEqual([
      ['blue', ''],
      [' sea', 'Groq, llama-3.3-70b-versatile'],
    ]);
  });

  test('a paste of AI text keeps its mark, and a snapshot restore brings marks back', () => {
    const { editor, doc } = mount('prose', '<p></p>');
    insertAiText(editor, 'kept words', ORIGIN, 'prose');
    const saved = Y.encodeStateAsUpdate(doc);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const slice = editor.state.doc.slice(1, 6);
    editor.view.dispatch(editor.state.tr.replaceSelection(slice).setMeta('uiEvent', 'paste'));
    expect(runs(editor)).toEqual([['kept wordskept ', 'Groq, llama-3.3-70b-versatile']]);

    editor.commands.setContent('<p>Other</p>');
    const old = new Y.Doc();
    Y.applyUpdate(old, saved);
    const node = yXmlFragmentToProseMirrorRootNode(old.getXmlFragment(YFRAGMENT), editor.schema);
    editor.chain().setMeta(KEEP_AI_MARKS, true).setContent(node).run();
    expect(runs(editor)).toEqual([['kept words', 'Groq, llama-3.3-70b-versatile']]);
    old.destroy();
  });

  test('the writer’s plain-text paste inside AI text is the writer’s, and a paste of AI text stays AI', () => {
    const { editor } = mount('prose', '<p></p>');
    insertAiText(editor, 'grey sea waves', ORIGIN, 'prose');
    editor.commands.setTextSelection(posOf(editor, 'sea'));
    // jsdom has no ClipboardEvent, so the paste events are plain objects with the clipboard data.
    const paste = (data: Record<string, string>) =>
      ({ clipboardData: { getData: (type: string) => data[type] ?? '' } }) as unknown as ClipboardEvent;
    editor.view.pasteText('MYOWN ', paste({ 'text/plain': 'MYOWN ' }));
    expect(runs(editor)).toEqual([
      ['grey ', 'Groq, llama-3.3-70b-versatile'],
      ['MYOWN ', ''],
      ['sea waves', 'Groq, llama-3.3-70b-versatile'],
    ]);
    const html = editor.getHTML().replace(/^<p>|<\/p>$/g, '');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const copied = html.slice(html.indexOf('<span'), html.indexOf('</span>') + 7);
    editor.view.pasteHTML(copied, paste({ 'text/html': copied }));
    // The pasted AI words join the AI words at the end, as one marked run.
    expect(runs(editor).at(-1)).toEqual(['sea wavesgrey', 'Groq, llama-3.3-70b-versatile']);
  });

  test('a damaged mark still names AI text', () => {
    expect(aiOriginOf({ provider: 'x', model: 'm', createdAt: Number.NaN })).toBeNull();
    expect(aiLabelOf({})).toBe('Unknown AI');
    expect(aiLabelOf({ provider: 'Ollama', model: '', createdAt: 1 })).toBe('Ollama');
  });
});

describe('the AI provenance page', () => {
  const marked = (text: string, model = 'llama') => ({
    type: 'text',
    text,
    marks: [{ type: AI_ORIGIN, attrs: { provider: 'Groq', model, createdAt: 1 } }],
  });
  const scene = (content: object[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });

  function request(extra: Partial<ExportRequest> = {}): ExportRequest {
    return {
      project: project('novel'),
      items: [item('a', 'scene', 'Arrival'), item('b', 'scene', 'Bridge')],
      scope: { kind: 'project' },
      updates: [
        [
          'a',
          updateOf(scene([{ type: 'text', text: 'Own words. ' }, marked('Twenty AI chars ok.')]), 'prose'),
        ],
        ['b', updateOf(scene([{ type: 'text', text: 'All mine here.' }]), 'prose')],
      ],
      format: 'markdown',
      people: [],
      shareSafe: false,
      ...extra,
    };
  }

  test('counts the AI share of the export and of each item, and names the models', () => {
    const prepared = prepareExport(request());
    const report = provenanceOf(prepared.doc);
    expect(report).toEqual({
      total: 'Own words. '.length + 'Twenty AI chars ok.'.length + 'All mine here.'.length,
      ai: 'Twenty AI chars ok.'.length,
      items: [{ title: 'Arrival', total: 30, ai: 19 }],
      models: ['Groq, llama'],
    });
    // Without the option, no page.
    expect(prepared.doc.sections.map((s) => s.title)).toEqual(['Arrival', 'Bridge']);
  });

  test('adds the page as the last section in each format', () => {
    const prepared = prepareExport(request({ provenance: { at: Date.UTC(2026, 10, 5) } }));
    const last = prepared.doc.sections.at(-1);
    expect(last?.title).toBe('AI provenance');
    const words = (last?.blocks ?? [])
      .flatMap((b: Block) => (b.type === 'list' ? b.items.flat() : [b]))
      .map((b) => (b.type === 'paragraph' || b.type === 'heading' ? runsText(b.runs) : ''))
      .join('\n');
    expect(words).toContain('43% of the text in this export carries the Vlo AI mark: 19 of 44 characters.');
    expect(words).toContain('2026-11-05');
    expect(words).toContain('Arrival: 63% (19 characters)');
    expect(words).toContain('Groq, llama');
  });

  test('says when no text carries the mark', () => {
    const prepared = prepareExport(
      request({
        updates: [['a', updateOf(scene([{ type: 'text', text: 'Mine.' }]), 'prose')]],
        provenance: { at: 0 },
      }),
    );
    const page = prepared.doc.sections.at(-1)?.blocks[1];
    expect(page?.type === 'paragraph' && runsText(page.runs)).toContain('No text in this export carries');
  });

  test('counts AI text in a share-safe memoir, where aliases take the place of real names', () => {
    const name = (text: string, ai: boolean) => ({
      type: 'text',
      text,
      marks: [
        { type: 'privateName', attrs: { personId: 'p1' } },
        ...(ai ? [{ type: AI_ORIGIN, attrs: { provider: 'Groq', model: 'llama', createdAt: 1 } }] : []),
      ],
    });
    const prepared = prepareExport({
      project: project('memoir'),
      items: [item('m', 'memory', 'Kitchen')],
      scope: { kind: 'project' },
      updates: [
        [
          'm',
          updateOf(
            scene([
              name('Rosa', false),
              { type: 'text', text: ' baked. ' },
              name('Rosa', true),
              marked(' sang to Rosa.'),
            ]),
            'prose',
          ),
        ],
      ],
      format: 'markdown',
      people: [{ id: 'p1', variants: [{ real: 'Rosa', alias: 'Maria' }] }],
      shareSafe: true,
      provenance: { at: Date.UTC(2026, 10, 5) },
    });
    const text = JSON.stringify(prepared.doc);
    expect(text).not.toContain('Rosa');
    const report = provenanceOf({ ...prepared.doc, sections: prepared.doc.sections.slice(0, -1) });
    // "Maria" and " sang to Maria." keep the AI mark after the swap: 5 + 15 characters.
    expect(report.ai).toBe('Maria'.length + ' sang to Maria.'.length);
    expect(report.total).toBe('Maria baked. Maria sang to Maria.'.length);
    const page = prepared.doc.sections.at(-1)?.blocks[1];
    expect(page?.type === 'paragraph' && runsText(page.runs)).toContain('20 of 33 characters');
  });

  test('rounds a share for people', () => {
    expect(percent(0, 10)).toBe('0%');
    expect(percent(1, 1000)).toBe('less than 1%');
    expect(percent(999, 1000)).toBe('99%');
    expect(percent(10, 10)).toBe('100%');
    expect(percent(1, 3)).toBe('33%');
  });
});
