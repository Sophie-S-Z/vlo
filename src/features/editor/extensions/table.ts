import { TableCell, TableHeader, TableKit } from '@tiptap/extension-table';
import { DOMParser as SchemaParser, Fragment, type Node, type Schema } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { isInTable, rowIsHeader, selectedRect } from '@tiptap/pm/tables';

/*
 * Tables (Phase 19, Task F2), in prose only. Insert > Table puts one at the caret, and Format > Table adds
 * and deletes rows and columns, turns the header row on and off, and merges and splits cells. A drag on a
 * column edge sets its width. Tab and Shift-Tab move between cells, and Tab in the last cell adds a row. A
 * cell holds paragraphs only, so each export can show it.
 */

/**
 * The paragraphs of a pasted or imported cell. Each block of text in the cell, such as a list item or a
 * quote, becomes a paragraph, so its words stay in the cell.
 */
function cellContent(dom: globalThis.Node, schema: Schema): Fragment {
  const { paragraph } = schema.nodes;
  if (!paragraph) return Fragment.empty;
  const out: Node[] = [];
  SchemaParser.fromSchema(schema)
    .parse(dom)
    .descendants((node) => {
      if (!node.isTextblock) return true;
      out.push(node.type === paragraph ? node : paragraph.create(null, node.content));
      return false;
    });
  return Fragment.from(out.length > 0 ? out : paragraph.create());
}

/** The most rows and columns that the grid of Insert > Table offers. */
export const TABLE_GRID = 8;

/** The row and column of the caret, from 1, and the size of its table. */
export interface CellPlace {
  row: number;
  column: number;
  rows: number;
  columns: number;
}

/** The place of the caret in its table, or null outside a table. */
export function cellPlace(state: EditorState): CellPlace | null {
  if (!isInTable(state)) return null;
  const { top, left, map } = selectedRect(state);
  return { row: top + 1, column: left + 1, rows: map.height, columns: map.width };
}

/** True when the caret's table has a header row. */
export function hasHeaderRow(state: EditorState): boolean {
  if (!isInTable(state)) return false;
  const { map, table } = selectedRect(state);
  return rowIsHeader(map, table, 0);
}

export const Tables = [
  TableKit.configure({
    table: { resizable: true, cellMinWidth: 48, HTMLAttributes: { class: 'vlo-table' } },
    tableCell: false,
    tableHeader: false,
  }),
  TableCell.extend({ content: 'paragraph+', parseHTML: () => [{ tag: 'td', getContent: cellContent }] }),
  TableHeader.extend({ content: 'paragraph+', parseHTML: () => [{ tag: 'th', getContent: cellContent }] }),
];
