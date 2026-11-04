import { convertLatexToMarkup, convertLatexToSpeakableText, MathfieldElement } from 'mathlive';
import 'mathlive/fonts.css';
import 'mathlive/static.css';
import { watchKeyboard } from './keyboard';

/*
 * The MathLive chunk. It loads the first time a writer adds an equation or opens text that has one. The
 * fonts come from Vlo's own files through the CSS above, so MathLive fetches nothing by itself, and the
 * keyboard makes no sounds.
 */

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;
MathfieldElement.keypressSound = null;
MathfieldElement.plonkSound = null;

watchKeyboard(window.mathVirtualKeyboard);

export { MathfieldElement };

/** Shows or hides the symbol keyboard. */
export function setKeyboard(show: boolean): void {
  if (show) window.mathVirtualKeyboard.show({ animate: true });
  else if (window.mathVirtualKeyboard.visible) window.mathVirtualKeyboard.hide({ animate: false });
}

/** The drawn equation. Throws for LaTeX that MathLive refuses, such as a link with a script address. */
export function renderMath(latex: string, display: boolean): DocumentFragment {
  const html = convertLatexToMarkup(latex, { defaultMode: display ? 'math' : 'inline-math' });
  const template = document.createElement('template');
  template.innerHTML = html;
  // The drawing stays inert: no ids that can clash with the page, and no links inside the text.
  for (const el of template.content.querySelectorAll('[id]')) el.removeAttribute('id');
  for (const link of template.content.querySelectorAll('a')) link.removeAttribute('href');
  return template.content;
}

/** The equation in words, for screen readers: "x squared plus 1". */
export function speakMath(latex: string): string {
  try {
    return convertLatexToSpeakableText(latex).replace(/\s+/g, ' ').trim();
  } catch {
    return latex;
  }
}
