import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { toDocx } from '@/features/export/docx';
import { toEpub } from '@/features/export/epub';
import { cleanLanguage, languageLabel, textDirection } from '@/lib/language';
import { loadPublicFile, singleDoc } from './export-fixtures';

/* The project language (roadmap F38, plan Task G9, decision P6). */

describe('language', () => {
  test.each(['he', 'ar', 'fa', 'ur', 'yi', 'he-IL'])('%s reads from right to left', (language) => {
    expect(textDirection(language)).toBe('rtl');
  });

  test.each(['en', 'zh', 'ja', undefined, 'not a language'])('%s reads from left to right', (language) => {
    expect(textDirection(language)).toBe('ltr');
  });

  test('a stored tag is cleaned, and a tag that is not valid gives none', () => {
    expect(cleanLanguage('PT-br')).toBe('pt-BR');
    expect(cleanLanguage('not a language')).toBeUndefined();
    expect(cleanLanguage(7)).toBeUndefined();
  });

  test('the picker names a language in its own words and in English', () => {
    expect(languageLabel('he')).toBe('\u05e2\u05d1\u05e8\u05d9\u05ea (Hebrew)');
    expect(languageLabel('en')).toBe('English');
  });
});

describe('exports name the language', () => {
  const hebrew = () => ({ ...singleDoc({ type: 'doc', content: [] }, 'poem'), language: 'he' });

  test('EPUB: every page has the language and the direction, and the book turns from the right', async () => {
    const zip = await JSZip.loadAsync((await toEpub(hebrew(), { loadFile: loadPublicFile })).bytes);
    const opf = (await zip.file('OEBPS/content.opf')?.async('string')) ?? '';
    expect(opf).toContain('<dc:language>he</dc:language>');
    expect(opf).toContain('<spine page-progression-direction="rtl">');
    const nav = (await zip.file('OEBPS/nav.xhtml')?.async('string')) ?? '';
    expect(nav).toContain('xml:lang="he" lang="he" dir="rtl"');
  });

  test('Word: the default run has the language, and each paragraph reads from right to left', async () => {
    const styles =
      (await (await JSZip.loadAsync(await toDocx(hebrew()))).file('word/styles.xml')?.async('string')) ?? '';
    expect(styles).toContain('w:bidi="he"');
    expect(styles).toContain('<w:rtl/>');
    expect(styles).toMatch(/<w:pPrDefault>.*<w:bidi\/>/s);
  });

  test('an English project keeps its exports as before', async () => {
    const styles =
      (await (
        await JSZip.loadAsync(await toDocx(singleDoc({ type: 'doc', content: [] }, 'prose')))
      )
        .file('word/styles.xml')
        ?.async('string')) ?? '';
    expect(styles).toContain('w:val="en"');
    expect(styles).not.toContain('<w:rtl/>');
  });
});
