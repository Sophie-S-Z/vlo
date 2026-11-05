import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { scanInWorker } from './craftClient';
import type { LineScan } from './scan';

/*
 * The Craft labels of a poem (spec 8.3, plan Task C7, F19): the syllable count and the rhyme letter at
 * the end of each line, and a stress mark above each syllable. The labels sit in a layer outside
 * ProseMirror, so the poem text never changes. The worker scans after each typing pause. Until then, a
 * changed line hides its labels and the other lines keep theirs. Each line fades in with a short stagger,
 * and Calm mode and reduced motion show the labels at once.
 */

/** The typing pause before a new scan, in ms. */
const PAUSE = 250;
/** The stagger between lines as they appear, in ms, and its ceiling. */
const STAGGER = 14;
const MAX_DELAY = 420;

interface PoemLine {
  text: string;
  /** The document position where the line's text starts. */
  pos: number;
}

/** The text of each poem line. Each inline object counts as one space, so offsets match positions. */
function linesOf(editor: Editor): PoemLine[] {
  const out: PoemLine[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'poemLine') return true;
    out.push({ text: node.textBetween(0, node.content.size, '', ' '), pos: pos + 1 });
    return false;
  });
  return out;
}

interface Scanned {
  texts: string[];
  scans: LineScan[];
}

type Status = 'loading' | 'ready' | 'failed';

const METER_NAMES: Record<NonNullable<LineScan['meter']>, string> = {
  iambic: 'iambic',
  trochaic: 'trochaic',
  anapestic: 'anapestic',
  dactylic: 'dactylic',
};

function lineSummary(scan: LineScan): string {
  const parts = [`${String(scan.syllables)} ${scan.syllables === 1 ? 'syllable' : 'syllables'}`];
  if (scan.meter) parts.push(METER_NAMES[scan.meter]);
  if (scan.rhyme) parts.push(`rhyme ${scan.rhyme}`);
  return parts.join(', ');
}

/** A scanned line as the layer last saw it. Only a line near the screen has an element. */
interface Row {
  key: string;
  text: string;
  height: number;
  group: HTMLElement | null;
  hidden: boolean;
}

/** What the layer shows now. A line keeps its element while its text and letter stay the same. */
interface Drawn {
  rows: (Row | null)[];
  byKey: Map<string, HTMLElement>;
}

interface Planned {
  key: string;
  text: string;
  height: number;
  /** Null for a line far from the screen. */
  labels: {
    marks: { left: number; top: number; mark: string }[];
    end: { top: number; syllables: number; rhyme: string };
  } | null;
}

/** Lines this far above or below the screen get labels too, so a scroll shows them at once. */
const MARGIN = 1;

function lineElement(editor: Editor, line: PoemLine): HTMLElement | null {
  const node = editor.view.nodeDOM(line.pos - 1);
  return node instanceof HTMLElement ? node : null;
}

function shownCount(drawn: Drawn): number {
  return drawn.rows.filter((r) => r && !r.hidden).length;
}

/**
 * Draws the labels of each scanned line near the screen. A long poem keeps a few hundred elements at
 * most, so a key stays fast. It reads every place first and writes the labels after, so the browser lays
 * out the poem once.
 */
function draw(editor: Editor, layer: HTMLElement, scanned: Scanned, drawn: Drawn): void {
  if (editor.isDestroyed) return;
  const root = layer.parentElement;
  if (!root) return;
  const view = editor.view;
  const origin = root.getBoundingClientRect();
  const reach = window.innerHeight * MARGIN;
  const seen = new Map<string, number>();
  const plan: (Planned | null)[] = linesOf(editor).map((line, index) => {
    const scan = scanned.texts[index] === line.text ? scanned.scans[index] : undefined;
    if (!scan || scan.words.length === 0) return null;
    // The same line text can come twice, as in a refrain, so the key counts each time.
    const base = `${line.text}\u0000${scan.rhyme ?? ''}`;
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);
    const key = `${base}\u0000${String(nth)}`;
    const box = lineElement(editor, line)?.getBoundingClientRect();
    const height = box?.height ?? 0;
    const near = box !== undefined && box.bottom > -reach && box.top < window.innerHeight + reach;
    if (!near) return { key, text: line.text, height, labels: null };
    const marks: { left: number; top: number; mark: string }[] = [];
    for (const word of scan.words) {
      if (word.stresses.length === 0) continue;
      const start = view.coordsAtPos(line.pos + word.from, 1);
      const end = view.coordsAtPos(line.pos + word.to, -1);
      // A word that wraps to the next row keeps its marks over its first row.
      const right = Math.abs(end.top - start.top) < 2 ? end.left : start.left + 8 * word.stresses.length;
      const width = (right - start.left) / word.stresses.length;
      word.stresses.forEach((stress, k) => {
        if (stress === null) return;
        marks.push({
          left: start.left - origin.left + width * (k + 0.5),
          top: start.top - origin.top,
          mark: stress === 's' ? '/' : '˘',
        });
      });
    }
    const last = view.coordsAtPos(line.pos + line.text.length, -1);
    return {
      key,
      text: line.text,
      height,
      labels: {
        marks,
        end: { top: last.top - origin.top, syllables: scan.syllables, rhyme: scan.rhyme ?? '' },
      },
    };
  });

  // The writes: only new lines fade in, each a little after the one before.
  let fresh = 0;
  const keep = new Set<string>();
  drawn.rows = plan.map((p): Row | null => {
    if (!p) return null;
    if (!p.labels) return { key: p.key, text: p.text, height: p.height, group: null, hidden: false };
    keep.add(p.key);
    let group = drawn.byKey.get(p.key);
    if (!group) {
      group = document.createElement('div');
      group.className = 'vlo-craft-line';
      group.style.animationDelay = `${String(Math.min(fresh * STAGGER, MAX_DELAY))}ms`;
      fresh += 1;
      drawn.byKey.set(p.key, group);
    }
    const parts = p.labels.marks.map((m) => {
      const mark = document.createElement('span');
      mark.className = 'vlo-craft-mark';
      mark.textContent = m.mark;
      mark.style.left = `${String(m.left)}px`;
      mark.style.top = `${String(m.top)}px`;
      return mark;
    });
    const end = document.createElement('span');
    end.className = 'vlo-craft-end';
    end.style.top = `${String(p.labels.end.top)}px`;
    const count = document.createElement('span');
    count.textContent = String(p.labels.end.syllables);
    const rhyme = document.createElement('span');
    rhyme.className = 'vlo-craft-rhyme';
    rhyme.textContent = p.labels.end.rhyme;
    end.append(count, rhyme);
    group.replaceChildren(...parts, end);
    if (group.parentElement !== layer) layer.append(group);
    return { key: p.key, text: p.text, height: p.height, group, hidden: false };
  });
  for (const [key, group] of drawn.byKey) {
    if (keep.has(key)) continue;
    group.remove();
    drawn.byKey.delete(key);
  }
  layer.dataset.lines = String(shownCount(drawn));
}

/**
 * After an edit, before the next scan: hides the labels of each changed line, and of each line below it
 * when the edit moved them. Nothing is measured but the changed line, so a key never waits on the layer.
 */
function hideChanged(editor: Editor, layer: HTMLElement, drawn: Drawn): void {
  if (editor.isDestroyed) return;
  const lines = linesOf(editor);
  const sameCount = lines.length === drawn.rows.length;
  // The first line whose labels may now sit in the wrong place.
  let cut = Infinity;
  drawn.rows.forEach((row, index) => {
    if (!row || row.hidden) return;
    const line = lines[index];
    const changed = line?.text !== row.text;
    if (changed && !sameCount) cut = Math.min(cut, index);
    if (changed && sameCount && line) {
      // A changed height moves every line below it.
      const height = lineElement(editor, line)?.getBoundingClientRect().height ?? row.height;
      if (height !== row.height) cut = Math.min(cut, index + 1);
    }
    if (!changed && index < cut) return;
    row.hidden = true;
    if (row.group) {
      row.group.remove();
      drawn.byKey.delete(row.key);
    }
  });
  layer.dataset.lines = String(shownCount(drawn));
}

export function CraftLabels({ editor }: { editor: Editor }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [scanned, setScanned] = useState<Scanned>({ texts: [], scans: [] });

  // Scans now and after each typing pause. Only the answer to the latest request counts.
  useEffect(() => {
    let alive = true;
    let latest = 0;
    let timer: number | undefined;
    const run = () => {
      const texts = linesOf(editor).map((l) => l.text);
      const mine = (latest += 1);
      performance.mark('vlo-craft-scan');
      scanInWorker(texts).then(
        (scans) => {
          if (!alive || mine !== latest) return;
          setScanned({ texts, scans });
          setStatus('ready');
        },
        () => {
          if (alive && mine === latest) setStatus('failed');
        },
      );
    };
    const onUpdate = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, PAUSE);
    };
    run();
    editor.on('update', onUpdate);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      editor.off('update', onUpdate);
    };
  }, [editor]);

  // Draws after each scan and when the width changes. An edit only hides the labels that it changed.
  const drawn = useRef<Drawn>({ rows: [], byKey: new Map() });
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    let frame = 0;
    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        draw(editor, layer, scanned, drawn.current);
      });
    };
    draw(editor, layer, scanned, drawn.current);
    if (scanned.scans.length > 0 && performance.getEntriesByName('vlo-craft-scan').length > 0) {
      performance.measure('vlo-craft-labels', 'vlo-craft-scan');
    }
    // The hide waits for the next frame, so a burst of keys costs one pass, before that frame paints.
    let hideFrame = 0;
    const onEdit = () => {
      if (hideFrame !== 0) return;
      hideFrame = requestAnimationFrame(() => {
        hideFrame = 0;
        hideChanged(editor, layer, drawn.current);
      });
    };
    editor.on('update', onEdit);
    let width = editor.view.dom.clientWidth;
    const resize = new ResizeObserver(() => {
      const next = editor.view.dom.clientWidth;
      if (next === width) return;
      width = next;
      redraw();
    });
    resize.observe(editor.view.dom);
    // A scroll brings other lines near the screen. The capture phase hears a scroll of any container.
    // The drawn lines reach one screen past each edge, so a scroll of less than half a screen needs
    // nothing new.
    let drawnAt = layer.getBoundingClientRect().top;
    const onScroll = () => {
      const top = layer.getBoundingClientRect().top;
      if (Math.abs(top - drawnAt) < window.innerHeight / 2) return;
      drawnAt = top;
      redraw();
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    void document.fonts.ready.then(redraw);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(hideFrame);
      editor.off('update', onEdit);
      resize.disconnect();
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [editor, scanned]);

  // The labels go when the switch goes off.
  useEffect(() => {
    const state = drawn.current;
    return () => {
      for (const group of state.byKey.values()) group.remove();
      state.byKey.clear();
      state.rows = [];
    };
  }, []);

  const lines = scanned.scans.filter((s) => s.words.length > 0);

  return (
    <>
      <div ref={layerRef} className="vlo-craft-layer" aria-hidden="true" data-testid="craft-labels" />
      <p role="status" className="vlo-craft-status text-xs text-muted">
        {status === 'loading'
          ? 'Loading the pronouncing dictionary for the Craft labels.'
          : status === 'failed'
            ? 'Vlo could not load the pronouncing dictionary. Connect to the internet once, then turn Craft labels off and on again.'
            : 'Craft labels: the syllable count and the rhyme letter end each line, and a mark above each syllable shows its stress (˘ unstressed, / stressed).'}
      </p>
      {status === 'ready' && (
        <ol aria-label="Craft labels by line" className="sr-only">
          {lines.map((scan, i) => (
            <li key={`${String(i)}-${scan.rhyme ?? ''}`}>
              Line {String(i + 1)}: {lineSummary(scan)}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
