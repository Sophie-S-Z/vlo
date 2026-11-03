import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { Keyboard } from 'lucide-react';
import type { MathfieldElement } from 'mathlive';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/ui/button';
import { Switch } from '@/ui/switch';
import { closePanel, focusText } from '../../commands/editorBus';
import { dropEmptyMath, isMath, leaveMath, selectedMath } from '../../extensions/math';
import { cleanLatex, MATH_BLOCK, MATH_TEMPLATES, type MathTemplate } from '../../format/math';
import { useMathKeyboard } from '../../math/keyboard';
import { loadedMath, loadMath, type MathModule } from '../../math/load';
import { setOpenField } from '../../math/openField';
import { setWritingPrefs, useWritingPrefs } from '../../writingPrefs';

function latexAt(editor: Editor, pos: number | null): string {
  if (pos === null) return '';
  const node = editor.state.doc.nodeAt(pos);
  return isMath(node) ? cleanLatex(node?.attrs.latex) : '';
}

/** One template button's picture: the equation part drawn as it will look. */
function TemplatePicture({ lib, latex }: { lib: MathModule; latex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      ref.current.replaceChildren(lib.renderMath(latex, false));
    } catch {
      ref.current.textContent = latex;
    }
  }, [lib, latex]);
  return <span ref={ref} aria-hidden="true" className="pointer-events-none text-base" />;
}

/**
 * Edits the selected equation with MathLive. Buttons add fractions, roots, sums and more, and a symbol
 * keyboard has the rest, so the writer never needs LaTeX. Each change goes into the document at once, so
 * undo, autosave and other tabs see it. Enter or Done returns to the text just after the equation.
 */
export function MathPanel({ editor }: { editor: Editor }) {
  const [pos, setPos] = useState<number | null>(() => selectedMath(editor.state));
  const posRef = useRef(pos);
  const [latex, setLatex] = useState(() => latexAt(editor, pos));
  // The LaTeX this panel wrote last, so a change from elsewhere (undo, another tab) can be told apart.
  const written = useRef(latex);
  const [lib, setLib] = useState<MathModule | null>(loadedMath);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [group, setGroup] = useState(MATH_TEMPLATES[0]?.label ?? '');
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const { showLatex } = useWritingPrefs();
  const keyboard = useMathKeyboard();
  const headingId = useId();
  const helpId = useId();
  const latexId = useId();
  const switchId = useId();

  const block = pos !== null && editor.state.doc.nodeAt(pos)?.type.name === MATH_BLOCK;

  // These read refs only, so the field's listeners can keep the first copy.
  const commit = useCallback(
    (next: string) => {
      const at = posRef.current;
      const clean = cleanLatex(next);
      setLatex(clean);
      if (at === null || clean === written.current) return;
      written.current = clean;
      editor.commands.setMathLatex(at, clean);
    },
    [editor],
  );

  const done = useCallback(() => {
    // MathLive can send its last input event after the key that closes the panel, so read the field now.
    if (field.current) commit(field.current.value);
    const at = posRef.current;
    if (at !== null) {
      dropEmptyMath(editor, at);
      leaveMath(editor, at);
    }
    closePanel();
    focusText(editor);
  }, [editor, commit]);

  // The equation moves when text before it changes. A change from elsewhere shows in the field.
  useEffect(() => {
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      const current = posRef.current;
      if (current === null || !transaction.docChanged) return;
      const mapped = transaction.mapping.mapResult(current, 1);
      // A change from another tab replaces the whole paragraph, so the mapping reports the equation as
      // deleted even when it is still there. The editor keeps it selected, so look there.
      const next =
        !mapped.deleted && isMath(editor.state.doc.nodeAt(mapped.pos))
          ? mapped.pos
          : selectedMath(editor.state);
      posRef.current = next;
      setPos(next);
      const now = latexAt(editor, next);
      if (next !== null && now !== written.current) {
        written.current = now;
        setLatex(now);
        if (field.current && field.current.value !== now) field.current.value = now;
      }
    };
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('transaction', onTransaction);
    };
  }, [editor]);

  // The equation is gone, for example after an undo or a change in another tab.
  useEffect(() => {
    if (pos === null) closePanel();
  }, [pos]);

  // MathLive loads on first use, then the field takes focus so the writer can type at once.
  useEffect(() => {
    let cancelled = false;
    let made: MathfieldElement | null = null;
    loadMath().then(
      (loaded) => {
        if (cancelled || !host.current) return;
        setLib(loaded);
        setFailed(false);
        made = new loaded.MathfieldElement();
        made.value = latexAt(editor, posRef.current);
        made.setAttribute('aria-label', 'Equation');
        made.setAttribute('aria-describedby', helpId);
        made.className = 'vlo-math-field';
        made.addEventListener('input', () => {
          if (made) commit(made.value);
        });
        // Enter returns to the text. Ctrl+Enter and Alt+Enter still add a matrix row.
        made.addEventListener(
          'keydown',
          (event) => {
            if (event.key !== 'Enter' || event.isComposing) return;
            if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
            event.preventDefault();
            event.stopPropagation();
            done();
          },
          { capture: true },
        );
        host.current.replaceChildren(made);
        field.current = made;
        const mine = made;
        setOpenField(() => {
          commit(mine.value);
        });
        made.focus();
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      setOpenField(null);
      made?.remove();
      field.current = null;
      loadedMath()?.setKeyboard(false);
    };
  }, [editor, commit, done, helpId, attempt]);

  const insertTemplate = (template: MathTemplate) => {
    const mf = field.current;
    if (!mf) return;
    mf.focus();
    mf.insert(template.insert, { selectionMode: 'placeholder', focus: true });
    commit(mf.value);
  };

  const remove = () => {
    const at = posRef.current;
    const node = at === null ? null : editor.state.doc.nodeAt(at);
    if (at === null || !node || !isMath(node)) return;
    posRef.current = null;
    editor.view.dispatch(editor.state.tr.delete(at, at + node.nodeSize).scrollIntoView());
    closePanel();
    focusText(editor);
  };

  if (pos === null) return null;
  const templates = MATH_TEMPLATES.find((g) => g.label === group)?.templates ?? [];

  return (
    <div className="grid gap-3">
      <h2 id={headingId} className="text-sm font-medium">
        {block ? 'Equation on its own line' : 'Equation'}
      </h2>

      <div className="min-h-12 rounded-md border border-rule bg-bg focus-within:border-accent">
        {/* MathLive's field goes here. React leaves this element's children alone. */}
        <div ref={host} />
        {failed ? (
          <div className="grid gap-2 p-3 text-sm">
            <p>The equation editor did not load. Check the connection, then try again.</p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          !lib && <p className="p-3 text-sm text-muted">Loading the equation editor.</p>
        )}
      </div>

      {lib && (
        <>
          <div
            role="group"
            aria-label="Equation part groups"
            className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
          >
            {MATH_TEMPLATES.map((g) => (
              <button
                key={g.label}
                type="button"
                aria-pressed={group === g.label}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  setGroup(g.label);
                }}
                className="min-h-9 shrink-0 rounded-full border border-rule px-3 text-xs whitespace-nowrap text-muted hover:text-text aria-pressed:border-accent aria-pressed:text-accent-text"
              >
                {g.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label={`${group} parts`} className="grid grid-cols-4 gap-1">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                aria-label={template.label}
                title={template.label}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  insertTemplate(template);
                }}
                className="flex min-h-12 items-center justify-center overflow-hidden rounded-md border border-transparent px-1 text-text outline-none hover:border-rule hover:bg-bg focus-visible:ring-2 focus-visible:ring-accent"
              >
                <TemplatePicture lib={lib} latex={template.preview} />
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-pressed={keyboard.visible}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                field.current?.focus();
                lib.setKeyboard(!keyboard.visible);
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted outline-none hover:bg-bg hover:text-text focus-visible:ring-2 focus-visible:ring-accent aria-pressed:text-accent-text pointer-fine:min-h-9"
            >
              <Keyboard aria-hidden="true" className="size-4" />
              Symbol keyboard
            </button>
            <div className="flex items-center gap-2">
              <Switch
                id={switchId}
                checked={showLatex}
                onCheckedChange={(on) => {
                  setWritingPrefs({ showLatex: on });
                }}
              />
              <label htmlFor={switchId} className="text-sm text-muted">
                Show LaTeX
              </label>
            </div>
          </div>

          {showLatex && (
            <div className="grid gap-1">
              <label htmlFor={latexId} className="text-xs text-muted">
                LaTeX
              </label>
              <textarea
                id={latexId}
                value={latex}
                rows={2}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => {
                  const next = event.target.value;
                  if (field.current) field.current.value = next;
                  commit(next);
                }}
                className="min-h-11 w-full resize-y rounded-md border border-rule bg-bg px-3 py-2 font-mono text-sm text-text outline-none focus-visible:border-accent"
              />
            </div>
          )}
        </>
      )}

      <p id={helpId} className="text-xs text-muted">
        Type / for a fraction. Words such as pi, alpha and sqrt turn into symbols. Enter returns to your text.
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" onClick={remove}>
          Remove equation
        </Button>
        <Button type="button" onClick={done}>
          Done
        </Button>
      </div>
    </div>
  );
}
