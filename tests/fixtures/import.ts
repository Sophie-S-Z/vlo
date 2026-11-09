import JSZip from 'jszip';

/*
 * Files from other writing tools for the import tests (roadmap F34): a Word file and a Scrivener 3
 * project, each made here from its own XML or RTF, so a test can read the source next to its result.
 */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const run = (text: string, props = '') =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const heading = (style: string, text: string) =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${run(text)}</w:p>`;

/** Heading 1 "Chapter One", two Heading 2 scenes, marks, a line break, a footnote and a table. */
export const DOCX_DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<w:document ${W}><w:body>
${heading('Heading1', 'Chapter One')}
${heading('Heading2', 'The ledger')}
<w:p>${run('Mira', '<w:b/>')}${run(' counted the coins ')}${run('twice', '<w:i/>')}<w:r><w:footnoteReference w:id="1"/></w:r>${run('.')}</w:p>
<w:tbl><w:tr><w:tc><w:p>${run('Coins')}</w:p></w:tc></w:tr></w:tbl>
${heading('Heading2', 'The key')}
<w:p>${run('Rosa', '<w:u w:val="single"/>')}${run(' left', '<w:strike/>')}<w:r><w:br/></w:r>${run('at dawn.')}</w:p>
</w:body></w:document>`;

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles ${W}>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
</w:styles>`;

const DOCX_FOOTNOTES = `<?xml version="1.0" encoding="UTF-8"?>
<w:footnotes ${W}><w:footnote w:id="1"><w:p>${run('Forty short.')}</w:p></w:footnote></w:footnotes>`;

export async function docxBytes(document = DOCX_DOCUMENT): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('word/document.xml', document);
  zip.file('word/styles.xml', DOCX_STYLES);
  zip.file('word/footnotes.xml', DOCX_FOOTNOTES);
  return zip.generateAsync({ type: 'uint8array' });
}

const SCRIVX = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
<Binder>
<BinderItem UUID="DRAFT" Type="DraftFolder"><Title>Manuscript</Title><Children>
  <BinderItem UUID="CH1" Type="Folder"><Title>Chapter One</Title><Children>
    <BinderItem UUID="S1" Type="Text"><Title>The ledger</Title></BinderItem>
    <BinderItem UUID="S2" Type="Text"><Title>The key</Title></BinderItem>
  </Children></BinderItem>
</Children></BinderItem>
<BinderItem UUID="RES" Type="ResearchFolder"><Title>Research</Title><Children>
  <BinderItem UUID="R1" Type="Text"><Title>Harbour notes</Title></BinderItem>
  <BinderItem UUID="R2" Type="PDF"><Title>Tide table</Title></BinderItem>
</Children></BinderItem>
<BinderItem UUID="TRASH" Type="TrashFolder"><Title>Trash</Title><Children>
  <BinderItem UUID="OLD" Type="Text"><Title>Old opening</Title></BinderItem>
</Children></BinderItem>
</Binder>
</ScrivenerProject>`;

const rtf = (body: string) =>
  `{\\rtf1\\ansi\\ansicpg1252\\uc1{\\fonttbl{\\f0\\fnil Palatino;}}{\\colortbl;\\red0\\green0\\blue0;}\n\\f0 ${body}}`;

/** The files of "Salt Year.scriv", by their path inside the folder that holds it. */
export const SCRIVENER_FILES: Record<string, string> = {
  'Salt Year.scriv/Salt Year.scrivx': SCRIVX,
  'Salt Year.scriv/Files/Data/S1/content.rtf': rtf(
    "\\b Mira\\b0  paid the caf\\'e9 in \\u8220?coins\\u8221?.{\\footnote\\pard\\plain \\chftn Forty short.}\\par\nThe tide\\tab turned.\\par\n{\\*\\shppict{\\pict\\pngblip 89504e47}}",
  ),
  'Salt Year.scriv/Files/Data/S1/synopsis.txt': 'Mira counts the debt.\n',
  'Salt Year.scriv/Files/Data/S2/content.rtf': rtf('{\\i Rosa} left at dawn.\\par'),
  'Salt Year.scriv/Files/Data/R1/content.rtf': rtf('The harbour master comes on Fridays.\\par'),
  'Salt Year.scriv/Files/Data/OLD/content.rtf': rtf('A first try.\\par'),
};

export async function zipOf(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, data] of Object.entries(files)) zip.file(path, data);
  return zip.generateAsync({ type: 'uint8array' });
}
