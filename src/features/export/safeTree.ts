import { nameCheck, shareSafe, type NameCheck } from '@/lib/privacy';
import { buildExportDoc } from './build';
import { exportWords } from './manuscript';
import type { ExportDoc } from './model';
import { provenanceSection } from './provenance';
import type { ExportRequest } from './run';

/*
 * The export tree that leaves the device, as an export file or a share link. This module is apart from
 * run.ts, so the Share panel does not load the PDF font code (fontkit) that the export file needs.
 */

/** What leaves the device as an export file or a share link: the writer's text and the privacy switches. */
export type SafeTreeInput = Pick<
  ExportRequest,
  'project' | 'items' | 'scope' | 'updates' | 'people' | 'shareSafe' | 'provenance' | 'review'
>;

export interface SafeTree {
  /** The export tree with each private name as its alias when `shareSafe` is on, and the provenance page. */
  doc: ExportDoc;
  /** The writer's own words, without the provenance page. */
  words: number;
  /** The unmarked and changed private names, read before the aliases go in. */
  names: NameCheck;
}

/**
 * The export tree that an export file and a share link both send (spec sections 8.2 and 11). The order
 * matters: the name check reads the real names, the aliases go in next, and the provenance page counts
 * the aliased text, so the page holds no real name.
 */
export function safeExportTree(input: SafeTreeInput): SafeTree {
  const built = buildExportDoc({ ...input, updates: new Map(input.updates) });
  const names = input.shareSafe ? nameCheck(built, input.people) : { unmarked: [], changed: [] };
  const safe = shareSafe(built, input.people, input.shareSafe);
  const words = exportWords(safe);
  const doc = input.provenance
    ? { ...safe, sections: [...safe.sections, provenanceSection(safe, new Date(input.provenance.at))] }
    : safe;
  return { doc, words, names };
}
