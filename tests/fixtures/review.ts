import JSZip from 'jszip';

/*
 * A Word file that Vlo exported and an editor changed with tracked changes and comments (F45). It is made
 * here from its own XML, as Word writes it, so a test can read the source next to its result.
 *
 * The scene was "Mira finds the ledger." and "It is cold.". Ana Ruiz deletes "Mira ", inserts " at dawn",
 * asks "Which ledger?" on "ledger" and "Show it." on the second paragraph, and adds "She runs." as a new
 * paragraph. Ben Ode replies "The blue one." to the first comment.
 */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const ANA = 'w:author="Ana Ruiz" w:date="2026-11-01T10:00:00Z"';
const BEN = 'w:author="Ben Ode" w:date="2026-11-02T09:30:00Z"';

const run = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const comment = (id: number, who: string, text: string) =>
  `<w:comment w:id="${String(id)}" ${who}><w:p><w:r><w:annotationRef/></w:r>${run(text)}</w:p></w:comment>`;
const reference = (id: number) => `<w:r><w:commentReference w:id="${String(id)}"/></w:r>`;

export const REVIEW_TEXT = ['Mira finds the ledger.', 'It is cold.'];

/** The document of the changed file. `bookmark` names the scene's section, as Vlo's export does. */
export function reviewDocument(bookmark: string | null): string {
  const mark = bookmark ? `<w:bookmarkStart w:id="0" w:name="${bookmark}"/><w:bookmarkEnd w:id="0"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<w:document ${W}><w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${run('Scene 1')}</w:p>
<w:p>${mark}<w:del w:id="11" ${ANA}><w:r><w:delText xml:space="preserve">Mira </w:delText></w:r></w:del>${run('finds the ')}<w:commentRangeStart w:id="1"/><w:commentRangeStart w:id="2"/>${run('ledger')}<w:commentRangeEnd w:id="1"/>${reference(1)}<w:commentRangeEnd w:id="2"/>${reference(2)}<w:ins w:id="12" ${ANA}>${run(' at')}${run(' dawn')}</w:ins>${run('.')}</w:p>
<w:p><w:commentRangeStart w:id="3"/>${run('It is ')}${run('cold.')}<w:commentRangeEnd w:id="3"/>${reference(3)}</w:p>
<w:p><w:pPr><w:rPr><w:ins w:id="13" ${ANA}/></w:rPr></w:pPr><w:ins w:id="14" ${ANA}>${run('She runs.')}</w:ins></w:p>
</w:body></w:document>`;
}

const COMMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<w:comments ${W}>${comment(1, ANA, 'Which ledger?')}${comment(2, BEN, 'The blue one.')}${comment(3, ANA, 'Show it.')}</w:comments>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
</Relationships>`;

export async function reviewedDocx(bookmark: string | null): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS);
  zip.file('word/document.xml', reviewDocument(bookmark));
  zip.file('word/comments.xml', COMMENTS);
  return zip.generateAsync({ type: 'uint8array' });
}
