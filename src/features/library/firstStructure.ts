import type { Template } from '@/lib/db';

/*
 * The structure that each mode starts from when the writer picks none (Phase 17 decision M2). The list of
 * structures loads only when the New project dialog shows a mode that has them, so the Library page
 * stays small. A unit test keeps these ids the first of each mode in structures.ts.
 */
export const FIRST_STRUCTURE: Readonly<Partial<Record<Template, string>>> = {
  essay: 'five-paragraph',
  article: 'blog-post',
  research: 'imrad',
};
