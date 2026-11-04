import { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { closePanel, getPanelRequest } from '@/features/editor/commands/editorBus';
import { COMMANDS, command, commandsFor } from '@/features/editor/commands/registry';
import { DOC_SCHEMA } from '@/features/editor/docSchema';
import { dropEmptyMath, leaveMath, selectedMath } from '@/features/editor/extensions/math';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import {
  cleanLatex,
  MATH_BLOCK,
  MATH_INLINE,
  MATH_TEMPLATES,
  MAX_LATEX_LENGTH,
  mathText,
  selectionLatex,
} from '@/features/editor/format/math';
import { docBody, docText } from '@/features/editor/itemText';
import { poemDataFromDoc, poemDataToJSON } from '@/features/editor/poemText';

/*
 * Task A6: equations. MathLive itself needs a real browser, so these tests stand in a small drawing
 * module for it. The Playwright tests use the real one.
 */

const load = vi.hoisted(() => {
  const fake = {
    renderMath: (latex: string) => {
      if (latex.includes('\\bad')) throw new Error('Unknown command');
      const fragment = document.createDocumentFragment();
      const drawn = document.createElement('span');
      drawn.className = 'ML__latex';
      drawn.textContent = `drawn:${latex}`;
      fragment.append(drawn);
      return fragment;
    },
    speakMath: (latex: string) => `spoken ${latex}`,
    setKeyboard: () => undefined,
  };
  const state = { ready: null as typeof fake | null, resolve: null as (() => void) | null };
  return { fake, state };
});

vi.mock('@/features/editor/math/load', () => ({
  loadedMath: () => load.state.ready,
  loadMath: () =>
    new Promise((resolve) => {
      load.state.resolve = () => {
        load.state.ready = load.fake;
        resolve(load.fake);
      };
    }),
}));

const editors: Editor[] = [];
beforeEach(() => {
  load.state.ready = null;
  load.state.resolve = null;
});
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function mount(kind: 'prose' | 'poem', doc = new Y.Doc()) {
  const host = document.createElement('div');
  document.body.append(host);
  const extensions = kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc);
  const editor = new Editor({ element: host, extensions });
  editors.push(editor);
  return editor;
}

/** The position just after the first match of `word`. */
function after(e: Editor, word: string): number {
  let at = -1;
  e.state.doc.descendants((node, pos) => {
    if (at >= 0 || !node.isText) return;
    const i = node.text?.indexOf(word) ?? -1;
    if (i >= 0) at = pos + i + word.length;
  });
  if (at < 0) throw new Error(`No "${word}".`);
  return at;
}

/** Each equation in the document, as [type, LaTeX]. */
function equations(e: Editor): [string, string][] {
  const out: [string, string][] = [];
  e.state.doc.descendants((node) => {
    if (node.type.name === MATH_INLINE || node.type.name === MATH_BLOCK) {
      out.push([node.type.name, String(node.attrs.latex)]);
    }
  });
  return out;
}

describe('equation data', () => {
  test('LaTeX is a string without control characters, within the length limit', () => {
    expect(cleanLatex('\\frac{1}{2}')).toBe('\\frac{1}{2}');
    expect(cleanLatex('a\nb\tc\u0007d')).toBe('a b cd');
    expect(cleanLatex(42)).toBe('');
    expect(cleanLatex(null)).toBe('');
    expect(cleanLatex('x'.repeat(MAX_LATEX_LENGTH + 10))).toHaveLength(MAX_LATEX_LENGTH);
  });

  test('plain text puts an equation between $ signs in a line and $$ signs on its own line', () => {
    expect(mathText('x^2', false)).toBe('$x^2$');
    expect(mathText(' \\sqrt{2} ', true)).toBe('$$\\sqrt{2}$$');
    expect(mathText('   ', false)).toBe('');
  });

  test('every template has a unique id, a name, a preview and something to insert', () => {
    const ids = MATH_TEMPLATES.flatMap((g) => g.templates.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(MATH_TEMPLATES.map((g) => g.label)).toEqual(['Basics', 'Calculus', 'Matrices', 'Chemistry']);
    for (const t of MATH_TEMPLATES.flatMap((g) => g.templates)) {
      expect(t.label).not.toBe('');
      expect(t.insert).not.toBe('');
      expect(t.preview).not.toBe('');
    }
    const insertOf = (id: string) =>
      MATH_TEMPLATES.flatMap((g) => g.templates).find((t) => t.id === id)?.insert;
    expect(insertOf('fraction')).toBe('\\frac{#@}{#?}');
    expect(insertOf('matrix-2')).toBe('\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}');
  });

  test('documents with equations carry schema 3, so an older build never opens them', () => {
    expect(DOC_SCHEMA).toBe(3);
  });
});

describe('the registry', () => {
  test('prose offers both equation tools; poems offer only the equation in a line', () => {
    expect(command('math').forms).toEqual(['prose', 'poem']);
    expect(command('math-block').forms).toEqual(['prose']);
    expect(commandsFor('poem').map((c) => c.id)).not.toContain('math-block');
    expect(COMMANDS.filter((c) => c.id.startsWith('math')).every((c) => c.slash)).toBe(true);
  });

  test('the poem schema has no equation on its own line', () => {
    const e = mount('poem');
    expect(e.schema.nodes[MATH_INLINE]).toBeDefined();
    expect(e.schema.nodes[MATH_BLOCK]).toBeUndefined();
  });
});

describe('equations in prose', () => {
  test('Equation adds an empty equation at the caret, selects it and opens the panel', () => {
    const e = mount('prose');
    e.commands.setContent('<p>Area is  here.</p>');
    e.commands.setTextSelection(after(e, 'Area is '));
    const cmd = command('math');
    if (cmd.kind !== 'run') throw new Error('Equation is a run command.');
    expect(cmd.isEnabled?.(e)).toBe(true);
    expect(cmd.run(e)).toBe(true);
    expect(getPanelRequest()).toEqual({ editor: e, panel: 'math', anchor: 'caret' });
    closePanel();
    expect(equations(e)).toEqual([[MATH_INLINE, '']]);
    const at = selectedMath(e.state);
    expect(at).toBe(after(e, 'Area is '));
    expect(e.state.selection).toBeInstanceOf(NodeSelection);
  });

  test('selected LaTeX in one line becomes the equation', () => {
    const e = mount('prose');
    e.commands.setContent('<p>Energy: E=mc^2 always.</p>');
    const from = after(e, 'Energy: ');
    e.commands.setTextSelection({ from, to: from + 'E=mc^2'.length });
    expect(e.commands.insertMath()).toBe(true);
    expect(equations(e)).toEqual([[MATH_INLINE, 'E=mc^2']]);
    expect(e.getText()).toBe('Energy: $E=mc^2$ always.');
  });

  test('selected words keep their spaces and their % sign in the equation', () => {
    const e = mount('prose');
    e.commands.setContent('<p>Note: sin x is 50% of 2 y here.</p>');
    const from = after(e, 'Note: ');
    e.commands.setTextSelection({ from, to: from + 'sin x is 50% of 2 y'.length });
    expect(e.commands.insertMath()).toBe(true);
    expect(equations(e)).toEqual([[MATH_INLINE, 'sin\\ x\\ is\\ 50\\%\\ of\\ 2\\ y']]);
  });

  test('selected LaTeX keeps its meaning, and spaces around signs drop as LaTeX drops them', () => {
    expect(selectionLatex('a + b = c')).toBe('a + b = c');
    expect(selectionLatex('x^2 + y_1')).toBe('x^2 + y_1');
    expect(selectionLatex('\\frac{a}{b}')).toBe('\\frac{a}{b}');
    expect(selectionLatex(' cost $5 & tax #2 ')).toBe('cost\\ \\$5\\ \\&\\ tax\\ \\#2');
  });

  test('the LaTeX changes in place, and plain text, search text and HTML carry it', () => {
    const e = mount('prose');
    // JSON keeps the space at the end of the line, which HTML parsing drops.
    e.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A half: ' }] }],
    });
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.commands.insertMath();
    const at = selectedMath(e.state);
    if (at === null) throw new Error('No equation selected.');
    expect(e.commands.setMathLatex(at, '\\frac{1}{2}')).toBe(true);
    expect(e.commands.setMathLatex(1, 'x')).toBe(false);
    expect(docBody(e.state.doc, 'prose')).toBe('A half: $\\frac{1}{2}$');
    expect(docText(e.state.doc, 'prose')).toBe('A half: $\\frac{1}{2}$');
    const html = e.getHTML();
    expect(html).toContain('data-math-inline=""');
    expect(html).toContain('data-latex="\\frac{1}{2}"');

    // A copy into Vlo again keeps the equation.
    const copy = mount('prose');
    copy.commands.setContent(html);
    expect(equations(copy)).toEqual([[MATH_INLINE, '\\frac{1}{2}']]);
  });

  test('an equation on its own line replaces an empty paragraph, or goes after the current one', () => {
    const e = mount('prose');
    e.commands.setContent('<p>Before.</p><p></p>');
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    expect(e.commands.insertMathBlock('a^2+b^2=c^2')).toBe(true);
    expect(e.state.doc.child(1).type.name).toBe(MATH_BLOCK);
    expect(selectedMath(e.state)).not.toBeNull();

    e.commands.setTextSelection(after(e, 'Bef'));
    expect(e.commands.insertMathBlock('x')).toBe(true);
    expect(e.state.doc.child(0).textContent).toBe('Before.');
    expect(e.state.doc.child(1).attrs.latex).toBe('x');
    // The editor keeps an empty paragraph after a last block, so the caret can go below it.
    expect(e.state.doc.lastChild?.type.name).toBe('paragraph');
    expect(docBody(e.state.doc, 'prose')).toBe('Before.\n\n$$x$$\n\n$$a^2+b^2=c^2$$\n\n');
  });

  test('typed text goes after a selected equation and never replaces it', () => {
    const e = mount('prose');
    e.commands.setContent('<p>x</p>');
    e.commands.setTextSelection(2);
    e.commands.insertMath('y');
    const handled = e.view.someProp('handleTextInput', (f) => f(e.view, 0, 0, 'z', () => e.state.tr));
    expect(handled).toBe(true);
    expect(e.getText()).toBe('x$y$z');
  });

  test('a closed panel removes an equation left empty, and keeps one with LaTeX', () => {
    const e = mount('prose');
    e.commands.setContent('<p>Gone: </p>');
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.commands.insertMath();
    const empty = selectedMath(e.state);
    if (empty === null) throw new Error('No equation selected.');
    dropEmptyMath(e, empty);
    expect(equations(e)).toEqual([]);
    expect(e.state.selection).toBeInstanceOf(TextSelection);

    e.commands.insertMath('k');
    const kept = selectedMath(e.state);
    if (kept === null) throw new Error('No equation selected.');
    dropEmptyMath(e, kept);
    expect(equations(e)).toEqual([[MATH_INLINE, 'k']]);
    leaveMath(e, kept);
    expect(e.state.selection.from).toBe(kept + 1);
  });
});

describe('equations in poems', () => {
  test('a line with an equation keeps its hanging indent and spaces in the poem text', () => {
    const e = mount('poem');
    e.commands.setContent(poemDataToJSON([[{ text: 'Count   the stars:  ', hanging: 3 }]]));
    e.commands.setTextSelection(e.state.doc.content.size - 2);
    expect(e.commands.insertMath('\\infty')).toBe(true);
    expect(poemDataFromDoc(e.state.doc)).toEqual([[{ text: 'Count   the stars:  $\\infty$', hanging: 3 }]]);
    expect(docBody(e.state.doc, 'poem')).toBe('Count   the stars:  $\\infty$\n');
    const line = e.view.dom.querySelector<HTMLElement>('[data-poem-line]');
    expect(line?.dataset.hanging).toBe('3');
    expect(line?.style.paddingLeft).toBe('3em');
    expect(line?.style.textIndent).toBe('-3em');
    expect(line?.querySelector('[data-math-inline]')).not.toBeNull();
  });

  test('Shift-Tab takes spaces from the start of a line and never takes an equation that starts it', () => {
    const e = mount('poem');
    e.commands.setContent(poemDataToJSON([[{ text: '', hanging: 0 }]]));
    e.commands.setTextSelection(1);
    e.commands.insertMath('x');
    e.commands.setTextSelection(e.state.doc.content.size - 2);
    e.commands.insertContent('    after');
    e.commands.setTextSelection(2);
    expect(e.commands.outdentLine()).toBe(true);
    expect(poemDataFromDoc(e.state.doc)).toEqual([[{ text: '$x$    after', hanging: 0 }]]);
  });
});

describe('the drawing', () => {
  test('shows the LaTeX until MathLive loads, then the drawing with a spoken label', async () => {
    const e = mount('prose');
    e.commands.setContent('<p>Root: <span data-math-inline data-latex="\\sqrt{2}"></span></p>');
    const view = e.view.dom.querySelector<HTMLElement>('[data-math-inline]');
    expect(view?.textContent).toBe('\\sqrt{2}');
    expect(view?.classList.contains('vlo-math-pending')).toBe(true);
    expect(view?.getAttribute('role')).toBe('img');
    expect(view?.getAttribute('aria-label')).toBe('Equation: \\sqrt{2}');

    load.state.resolve?.();
    await vi.waitFor(() => {
      expect(view?.querySelector('.ML__latex')?.textContent).toBe('drawn:\\sqrt{2}');
    });
    expect(view?.classList.contains('vlo-math-pending')).toBe(false);
    expect(view?.getAttribute('aria-label')).toBe('Equation: spoken \\sqrt{2}');
  });

  test('an empty equation shows a box to aim at, and LaTeX that cannot be drawn shows as text', () => {
    load.state.ready = load.fake;
    const e = mount('prose');
    e.commands.setContent(
      '<p><span data-math-inline data-latex=""></span> and <span data-math-inline data-latex="\\bad"></span></p>',
    );
    const [empty, broken] = e.view.dom.querySelectorAll<HTMLElement>('[data-math-inline]');
    expect(empty?.textContent).toBe('Equation');
    expect(empty?.classList.contains('vlo-math-empty')).toBe(true);
    expect(empty?.getAttribute('aria-label')).toBe('Empty equation');
    expect(broken?.textContent).toBe('\\bad');
    expect(broken?.classList.contains('vlo-math-error')).toBe(true);
  });

  test('a change to the LaTeX draws again', () => {
    load.state.ready = load.fake;
    const e = mount('prose');
    e.commands.setContent('<p><span data-math-inline data-latex="a"></span></p>');
    e.commands.setMathLatex(1, 'b');
    expect(e.view.dom.querySelector('[data-math-inline]')?.textContent).toBe('drawn:b');
  });
});

describe('sync', () => {
  test('an equation survives a reload from the stored Yjs state and reaches another tab', () => {
    const doc = new Y.Doc();
    const e = mount('prose', doc);
    e.commands.setContent('<p>Sum: </p>');
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.commands.insertMath('\\sum_{i=1}^{n} i');
    e.commands.insertMathBlock('E=mc^2');

    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(doc));
    const again = mount('prose', reloaded);
    expect(equations(again)).toEqual([
      [MATH_INLINE, '\\sum_{i=1}^{n} i'],
      [MATH_BLOCK, 'E=mc^2'],
    ]);
  });
});
