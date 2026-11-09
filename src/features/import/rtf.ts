import { escapeHtml } from './outline';

/*
 * A small RTF reader for Scrivener's content files (roadmap F34). It keeps paragraphs, line breaks, tabs,
 * bold, italic, underline, strike, superscript, subscript, footnotes and every character (\uN and \'hh).
 * Font, color and style tables, pictures and other destinations are skipped. A table cell becomes a tab
 * and a row becomes a paragraph.
 */

interface Style {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  script: 'super' | 'sub' | null;
}

interface Group {
  style: Style;
  /** Text in this group goes nowhere, such as a font table. */
  skip: boolean;
  /** Text in this group goes into a footnote. */
  note: boolean;
  /** Characters to skip after \uN. */
  uc: number;
}

const PLAIN: Style = { bold: false, italic: false, underline: false, strike: false, script: null };

const SKIPPED = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'nonshppict',
  'header',
  'headerl',
  'headerr',
  'footer',
  'footerl',
  'footerr',
  'listtable',
  'listoverridetable',
  'revtbl',
  'rsidtbl',
  'xmlnstbl',
  'generator',
  'themedata',
  'latentstyles',
  'datastore',
  'object',
  'fldinst',
]);

export interface RtfText {
  html: string;
  /** Lines end with a line feed. */
  text: string;
  /** What the reader left out, such as "2 pictures". */
  skipped: string[];
}

export function readRtf(source: string): RtfText {
  const stack: Group[] = [];
  let group: Group = { style: { ...PLAIN }, skip: false, note: false, uc: 1 };
  let pendingSkip = 0;
  let star = false;
  const paragraphs: { html: string; text: string }[] = [];
  let html = '';
  let text = '';
  let note = '';
  let pictures = 0;
  let tables = 0;
  // \'hh bytes are in the code page that \ansicpg names. Windows-1252 is the RTF default.
  let codePage = new TextDecoder('windows-1252');

  // Characters with one style wait in `run`, so a bold word becomes one <strong>, not one for each letter.
  let run = '';
  let runStyle = PLAIN;
  const flush = () => {
    if (run === '') return;
    let out = escapeHtml(run);
    if (runStyle.script === 'super') out = `<sup>${out}</sup>`;
    if (runStyle.script === 'sub') out = `<sub>${out}</sub>`;
    if (runStyle.strike) out = `<s>${out}</s>`;
    if (runStyle.underline) out = `<u>${out}</u>`;
    if (runStyle.italic) out = `<em>${out}</em>`;
    if (runStyle.bold) out = `<strong>${out}</strong>`;
    html += out;
    run = '';
  };
  const put = (chars: string) => {
    if (group.skip || chars === '') return;
    if (group.note) {
      note += chars;
      return;
    }
    // Every style object has the keys of PLAIN in the same order, so the JSON text compares them.
    if (JSON.stringify(group.style) !== JSON.stringify(runStyle)) {
      flush();
      runStyle = { ...group.style };
    }
    run += chars;
    text += chars;
  };
  const endParagraph = () => {
    flush();
    paragraphs.push({ html, text });
    html = '';
    text = '';
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? '';
    if (ch === '{') {
      stack.push(group);
      group = { ...group, style: { ...group.style } };
      i += 1;
      continue;
    }
    if (ch === '}') {
      const closing = group;
      group = stack.pop() ?? group;
      if (closing.note && !group.note) {
        flush();
        html += `<sup data-footnote="" data-note="${escapeHtml(JSON.stringify(note.trim()))}"></sup>`;
        note = '';
      }
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      i += 1;
      continue;
    }
    if (ch !== '\\') {
      if (pendingSkip > 0) pendingSkip -= 1;
      else put(ch);
      i += 1;
      continue;
    }

    const next = source[i + 1] ?? '';
    if (next === "'") {
      const byte = parseInt(source.slice(i + 2, i + 4), 16);
      if (pendingSkip > 0) pendingSkip -= 1;
      else if (!Number.isNaN(byte)) put(codePage.decode(new Uint8Array([byte])));
      i += 4;
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) {
      // A control symbol: an escaped character, a no-break space, or the \* destination mark.
      if (next === '*') star = true;
      else if (next === '~') put('\u00a0');
      else if (next === '_') put('-');
      else if (next === '\n' || next === '\r') endParagraph();
      else if (next === '\\' || next === '{' || next === '}') put(next);
      i += 2;
      continue;
    }

    const word = /^([a-zA-Z]+)(-?\d+)? ?/.exec(source.slice(i + 1, i + 40));
    const name = word?.[1] ?? '';
    const param = word?.[2] === undefined ? null : Number(word[2]);
    i += 1 + (word?.[0].length ?? 1);

    // \*\shppict holds the picture that \nonshppict repeats for older readers, so Vlo counts it once.
    if ((star && name !== 'shppict') || SKIPPED.has(name)) {
      if (name === 'pict' && !group.skip) pictures += 1;
      // An unknown \* destination is skipped as the RTF spec says, but a footnote keeps its text.
      group.skip = name !== 'footnote';
      star = false;
      if (name !== 'footnote') continue;
    }
    star = false;
    switch (name) {
      case 'footnote':
        group.note = true;
        group.skip = false;
        break;
      case 'par':
      case 'page':
      case 'sect':
      case 'row':
        if (group.note) note += ' ';
        else if (!group.skip) endParagraph();
        if (name === 'row') tables += 1;
        break;
      case 'line':
        if (!group.skip && !group.note) {
          flush();
          html += '<br>';
          text += '\n';
        }
        break;
      case 'tab':
      case 'cell':
        put('\t');
        break;
      case 'emdash':
        put('\u2014');
        break;
      case 'endash':
        put('\u2013');
        break;
      case 'lquote':
        put('\u2018');
        break;
      case 'rquote':
        put('\u2019');
        break;
      case 'ldblquote':
        put('\u201c');
        break;
      case 'rdblquote':
        put('\u201d');
        break;
      case 'u':
        if (param !== null) put(String.fromCharCode(param < 0 ? param + 65536 : param));
        pendingSkip = group.uc;
        break;
      case 'ansicpg':
        try {
          codePage = new TextDecoder(param === 10000 ? 'macintosh' : `windows-${String(param)}`);
        } catch {
          // A code page that the browser cannot read, such as a double-byte one, stays Windows-1252.
        }
        break;
      case 'uc':
        group.uc = param ?? 1;
        break;
      case 'plain':
        group.style = { ...PLAIN };
        break;
      case 'b':
        group.style.bold = param !== 0;
        break;
      case 'i':
        group.style.italic = param !== 0;
        break;
      case 'ul':
        group.style.underline = param !== 0;
        break;
      case 'ulnone':
        group.style.underline = false;
        break;
      case 'strike':
        group.style.strike = param !== 0;
        break;
      case 'super':
        group.style.script = 'super';
        break;
      case 'sub':
        group.style.script = 'sub';
        break;
      case 'nosupersub':
        group.style.script = null;
        break;
    }
  }
  if (html !== '' || text !== '') endParagraph();

  return {
    html: paragraphs.map((p) => `<p>${p.html}</p>`).join(''),
    text: `${paragraphs.map((p) => p.text).join('\n')}\n`,
    skipped: [
      ...(pictures > 0 ? [pictures === 1 ? '1 picture' : `${String(pictures)} pictures`] : []),
      ...(tables > 0 ? ['table layout'] : []),
    ],
  };
}
