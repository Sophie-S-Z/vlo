import type { ScriptRole } from '@/features/editor/scriptRoles';
import { runsOf, runsText, type Block, type ExportDoc, type Run } from './model';
import { xmlText } from './xml';

/*
 * Fountain and Final Draft files of a script (roadmap 2 F63, plan Task M3). Both read the export tree.
 * A folder is a Fountain section ("#" for an act, "##" for a sequence). Final Draft has no sections, so
 * a folder title stays out of an FDX file. Text that is not a script line, such as a page of prose in a
 * mixed project, goes in as action.
 */

export interface ScriptLine {
  role: ScriptRole;
  runs: Run[];
}

/** One item or folder of a script, in reading order. */
type Part = { kind: 'folder'; level: number; title: string } | { kind: 'lines'; lines: ScriptLine[] };

/** Plain lines of a block that is not a script line. */
function otherLines(block: Block): ScriptLine[] {
  if (block.type === 'stanza') return block.lines.map((line) => ({ role: 'action', runs: line.runs }));
  if (block.type === 'list') return block.items.flatMap((item) => item.flatMap(otherLines));
  if (block.type === 'quote') return block.blocks.flatMap(otherLines);
  const runs = runsOf([block]);
  return runs.length === 0 ? [] : [{ role: 'action', runs }];
}

/** The parts of a script export. Empty lines stay out: a blank line in Fountain ends an element. */
export function scriptParts(doc: ExportDoc): Part[] {
  return doc.sections.map((section): Part => {
    if (section.form === null) {
      const heading = section.blocks[0];
      const level = heading?.type === 'heading' ? heading.level : 2;
      return { kind: 'folder', level, title: section.title };
    }
    const lines = section.blocks.flatMap((block) =>
      block.type === 'paragraph' && block.role ? [{ role: block.role, runs: block.runs }] : otherLines(block),
    );
    return { kind: 'lines', lines: lines.filter((line) => runsText(line.runs).trim() !== '') };
  });
}

const HEADING = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i;
const TRANSITION = /^[^\p{Ll}]*TO:$/u;
const IN_DIALOGUE: ReadonlySet<ScriptRole> = new Set(['parenthetical', 'dialogue', 'lyric']);

/** Fountain's emphasis: *italic*, **bold** and _underline_. A star or a line in the text gets a backslash. */
function fountainText(runs: readonly Run[]): string {
  let out = '';
  for (const run of runs) {
    if (run.type === 'break') out += ' ';
    if (run.type !== 'text') continue;
    const lead = /^\s*/.exec(run.text)?.[0] ?? '';
    const trail = /\s*$/.exec(run.text.slice(lead.length))?.[0] ?? '';
    let core = run.text.slice(lead.length, run.text.length - trail.length).replace(/([\\*_])/g, '\\$1');
    if (core !== '') {
      if (run.style.underline) core = `_${core}_`;
      if (run.style.italic) core = `*${core}*`;
      if (run.style.bold) core = `**${core}**`;
    }
    out += lead + core + trail;
  }
  return out;
}

/** One line of Fountain, with a forcing mark where the line alone would read as another element. */
function fountainLine(line: ScriptLine, next: ScriptLine | undefined): string {
  const text = fountainText(line.runs);
  switch (line.role) {
    case 'heading':
      return HEADING.test(text) ? text : `.${text}`;
    case 'character':
      return /\p{L}/u.test(text) && next !== undefined && IN_DIALOGUE.has(next.role) ? text : `@${text}`;
    case 'transition':
      return TRANSITION.test(text) ? text : `>${text}`;
    case 'lyric':
      return `~${text}`;
    case 'parenthetical':
    case 'dialogue':
      return text;
    case 'action':
      return HEADING.test(text) || TRANSITION.test(text) || /^[!@~.>#=]/.test(text) ? `!${text}` : text;
  }
}

/** A Fountain file: the title page, then each section and line. */
export function toFountain(doc: ExportDoc): string {
  const out: string[] = [`Title: ${doc.title}`];
  if (doc.author) out.push(`Author: ${doc.author}`);
  for (const part of scriptParts(doc)) {
    if (part.kind === 'folder') {
      out.push('', `${'#'.repeat(part.level)} ${part.title}`);
      continue;
    }
    part.lines.forEach((line, i) => {
      const before = part.lines[i - 1];
      // Lines of one speech follow the character with no blank line.
      const speech =
        IN_DIALOGUE.has(line.role) && before && (before.role === 'character' || IN_DIALOGUE.has(before.role));
      if (!speech) out.push('');
      out.push(fountainLine(line, part.lines[i + 1]));
    });
  }
  return `${out.join('\n')}\n`;
}

const FDX_TYPES: Readonly<Record<ScriptRole, string>> = {
  heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  // Final Draft has no lyric element in its screenplay template. A lyric is dialogue in italics.
  lyric: 'Dialogue',
};

function fdxText(runs: readonly Run[], lyric: boolean): string {
  return runs
    .flatMap((run) => {
      if (run.type === 'break') return ['<Text> </Text>'];
      if (run.type !== 'text' || run.text === '') return [];
      const styles = [
        run.style.bold && 'Bold',
        (run.style.italic ?? lyric) && 'Italic',
        run.style.underline && 'Underline',
      ].filter(Boolean);
      const style = styles.length > 0 ? ` Style="${styles.join('+')}"` : '';
      return [`<Text${style}>${xmlText(run.text)}</Text>`];
    })
    .join('');
}

/** A Final Draft file: one Paragraph for each line, with the element as its Type. */
export function toFdx(doc: ExportDoc): string {
  const paragraphs = scriptParts(doc).flatMap((part) =>
    part.kind === 'folder'
      ? []
      : part.lines.map(
          (line) =>
            `    <Paragraph Type="${FDX_TYPES[line.role]}">${fdxText(line.runs, line.role === 'lyric')}</Paragraph>`,
        ),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="5">',
    '  <Content>',
    ...paragraphs,
    '  </Content>',
    '</FinalDraft>',
    '',
  ].join('\n');
}
