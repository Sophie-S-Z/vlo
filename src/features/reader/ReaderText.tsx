import { createContext, createElement, Fragment, useContext, type ReactNode } from 'react';
import type { MathNode } from '@/features/export/mathml';
import {
  MATH_ATTRS,
  MATH_TAGS,
  safeLink,
  type ShareBlock,
  type ShareRun,
  type ShareText,
} from '@/features/share/bundle';

/*
 * The text of a share bundle, with React elements only (plan Task E4, Review Focus 1). No string becomes
 * markup: text goes in as text, a link needs https, and an equation is a tree of allowed MathML elements
 * with the allowed attributes only. The bundle passed `parseBundle` first, and this module checks again.
 */

export function MathTree({ node, display }: { node: MathNode; display?: 'block' | 'inline' }) {
  const render = (n: MathNode, key: number | undefined, root: boolean): ReactNode => {
    if (!MATH_TAGS.has(n.tag)) return null;
    const props: Record<string, string | number> = {};
    if (key !== undefined) props.key = key;
    for (const [name, value] of Object.entries(n.attrs)) if (MATH_ATTRS.has(name)) props[name] = value;
    if (root && display) props.display = display;
    // A container keeps its children. The space between them is not text.
    const text = n.children.length > 0 && n.text.trim() === '' ? null : n.text;
    return createElement(n.tag, props, text, ...n.children.map((c, i) => render(c, i, false)));
  };
  return <>{render(node, undefined, true)}</>;
}

function TextRun({ run }: { run: ShareText }) {
  let out: ReactNode = run.t;
  if (run.sub) out = <sub>{out}</sub>;
  if (run.sup) out = <sup>{out}</sup>;
  if (run.s) out = <s>{out}</s>;
  if (run.u) out = <u>{out}</u>;
  if (run.i) out = <em>{out}</em>;
  if (run.b) out = <strong>{out}</strong>;
  if (run.link && safeLink(run.link))
    out = (
      <a href={run.link} target="_blank" rel="noopener noreferrer nofollow">
        {out}
      </a>
    );
  return <>{out}</>;
}

export function Runs({ runs }: { runs: readonly ShareRun[] }) {
  return (
    <>
      {runs.map((run, i) => {
        if ('br' in run) return <br key={i} />;
        if ('math' in run) return <MathTree key={i} node={run.math} display="inline" />;
        if ('fn' in run)
          return (
            <sup key={i}>
              <a
                href={`#note-${String(run.fn)}`}
                id={`note-ref-${String(run.fn)}`}
                aria-label={`Note ${String(run.fn)}`}
              >
                {run.fn}
              </a>
            </sup>
          );
        return <TextRun key={i} run={run} />;
      })}
    </>
  );
}

const HEADINGS = ['h2', 'h3', 'h4', 'h5', 'h6'] as const;

/**
 * The bundle's highest heading level. It becomes h2 under the page's h1, so the outline skips no level: a
 * one-item link has its item title at level 2, and a whole book has its parts at level 1.
 */
export const TopHeading = createContext(1);

/** The highest heading level of some blocks, or 1. */
export function topHeading(blocks: readonly ShareBlock[]): number {
  let top = 5;
  const visit = (b: ShareBlock) => {
    if (b.type === 'h') top = Math.min(top, b.level);
    else if (b.type === 'quote') b.blocks.forEach(visit);
    else if (b.type === 'list') b.items.flat().forEach(visit);
  };
  blocks.forEach(visit);
  return top === 5 ? 1 : top;
}

function Heading({ block }: { block: Extract<ShareBlock, { type: 'h' }> }) {
  const top = useContext(TopHeading);
  const step = Math.max(0, block.level - top);
  return createElement(
    HEADINGS[step] ?? 'h6',
    {
      className: `font-display font-semibold ${step === 0 ? 'text-3xl' : step === 1 ? 'text-2xl' : 'text-xl'} ${block.align ? (ALIGN[block.align] ?? '') : ''}`,
    },
    <Runs runs={block.runs} />,
  );
}

const ALIGN: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
};

/** One block. The bundle's title is the page's h1, so the highest heading is an h2. */
export function Block({ block }: { block: ShareBlock }): ReactNode {
  switch (block.type) {
    case 'p':
      return (
        <p className={block.align ? ALIGN[block.align] : undefined}>
          <Runs runs={block.runs} />
        </p>
      );
    case 'h':
      return <Heading block={block} />;
    case 'list': {
      const items = block.items.map((blocks, i) => (
        <li key={i} className="grid gap-2 pl-1">
          {blocks.map((b, j) => (
            <Block key={j} block={b} />
          ))}
        </li>
      ));
      return block.ordered ? (
        <ol start={block.start} className="grid list-decimal gap-2 pl-6">
          {items}
        </ol>
      ) : (
        <ul className="grid list-disc gap-2 pl-6">{items}</ul>
      );
    }
    case 'quote':
      return (
        <blockquote className="grid gap-3 border-l border-rule pl-5 text-muted italic">
          {block.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </blockquote>
      );
    case 'stanza':
      return (
        <div className="grid">
          {block.lines.map((line, i) => (
            <p
              key={i}
              className="whitespace-pre-wrap"
              style={
                line.hanging > 0
                  ? { paddingLeft: `${String(line.hanging)}em`, textIndent: `-${String(line.hanging)}em` }
                  : undefined
              }
            >
              {line.runs.length === 0 ? ' ' : <Runs runs={line.runs} />}
            </p>
          ))}
        </div>
      );
    case 'break':
      return (
        <p role="separator" aria-label="Scene break" className="text-center tracking-[0.5em] text-muted">
          * * *
        </p>
      );
    case 'math':
      return (
        <div className="overflow-x-auto py-1 text-center">
          <MathTree node={block.math} display="block" />
        </div>
      );
  }
}

/** The footnotes of some blocks, in order, for the notes list. */
export function notesOf(blocks: readonly ShareBlock[]): { fn: number; note: ShareText[] }[] {
  const out: { fn: number; note: ShareText[] }[] = [];
  const runs = (list: readonly ShareRun[]) => {
    for (const run of list) if ('fn' in run) out.push(run);
  };
  const visit = (b: ShareBlock) => {
    switch (b.type) {
      case 'p':
      case 'h':
        runs(b.runs);
        break;
      case 'stanza':
        b.lines.forEach((l) => {
          runs(l.runs);
        });
        break;
      case 'quote':
        b.blocks.forEach(visit);
        break;
      case 'list':
        b.items.flat().forEach(visit);
        break;
      default:
        break;
    }
  };
  blocks.forEach(visit);
  return out;
}

export function NoteText({ note }: { note: readonly ShareText[] }) {
  return (
    <>
      {note.map((run, i) => (
        <Fragment key={i}>
          <TextRun run={run} />
        </Fragment>
      ))}
    </>
  );
}
