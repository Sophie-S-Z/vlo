import { createContext, useContext } from 'react';
import type { PageFormat } from '@/lib/db';
import type { FontValue } from './format/fonts';

/*
 * The open project's manuscript settings, for the tools inside the editor. The font menu reads the project
 * font and changes it for the whole project.
 */

export interface ManuscriptSettings {
  projectId: string;
  /** The project font: a Vlo font id or an installed font. */
  font: FontValue;
  page: PageFormat;
  /** The language of the writing (F38), so the counts inside the editor use its unit. */
  language: string | undefined;
  setFont: (font: FontValue) => void;
}

export const ManuscriptContext = createContext<ManuscriptSettings | null>(null);

/** The open project's manuscript settings, or null outside a project, such as in a unit test. */
export function useManuscript(): ManuscriptSettings | null {
  return useContext(ManuscriptContext);
}
