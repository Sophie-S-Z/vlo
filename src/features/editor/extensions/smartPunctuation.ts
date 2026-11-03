import Typography from '@tiptap/extension-typography';

/**
 * Smart punctuation: curly quotes, the em dash from "--" and the ellipsis from "...", as the Settings hint
 * says. Arrows, fractions, ×, ©, ² and the other symbol rules stay off, so "2x4" or "1/2" stay as typed.
 */
export const SmartPunctuation = Typography.configure({
  leftArrow: false,
  rightArrow: false,
  copyright: false,
  trademark: false,
  servicemark: false,
  registeredTrademark: false,
  oneHalf: false,
  plusMinus: false,
  notEqual: false,
  laquo: false,
  raquo: false,
  multiplication: false,
  superscriptTwo: false,
  superscriptThree: false,
  oneQuarter: false,
  threeQuarters: false,
});
