import { headerRows, type TableBlock, type TableCell } from './model';

/**
 * The HTML of a table (Phase 19, Task F2), for EPUB and the web copies. The header rows at the top go in a
 * thead, and each header cell is a th. With `widths`, a colgroup gives each column its share of the width.
 */
export function tableHtml(block: TableBlock, cellHtml: (cell: TableCell) => string, widths: boolean): string {
  const heads = headerRows(block);
  const row = (cells: readonly TableCell[]) =>
    `<tr>${cells
      .map((cell) => {
        const tag = cell.header ? 'th' : 'td';
        const spans =
          (cell.colspan > 1 ? ` colspan="${String(cell.colspan)}"` : '') +
          (cell.rowspan > 1 ? ` rowspan="${String(cell.rowspan)}"` : '');
        return `<${tag}${spans}>${cellHtml(cell)}</${tag}>`;
      })
      .join('')}</tr>`;
  const cols = widths
    ? `<colgroup>${block.widths
        .map((share) => `<col style="width: ${String(Math.round(share * 1000) / 10)}%"/>`)
        .join('')}</colgroup>`
    : '';
  const head = heads > 0 ? `<thead>${block.rows.slice(0, heads).map(row).join('')}</thead>` : '';
  const body = block.rows.slice(heads);
  return `<table>${cols}${head}${body.length > 0 ? `<tbody>${body.map(row).join('')}</tbody>` : ''}</table>`;
}
