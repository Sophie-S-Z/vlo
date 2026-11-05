import { clock } from '@/lib/clock';
import { db, type AiMode, type Project, type Template } from '@/lib/db';

/*
 * The AI mode of a project (spec section 10, F23). Pen is the default. The writer turns AI on for each
 * project, and a change away from Pen first explains what will change.
 */

export const MODES: readonly AiMode[] = ['pen', 'reader', 'cowriter'];

export const MODE_INFO: Record<AiMode, { label: string; summary: string }> = {
  pen: { label: 'Pen', summary: 'No AI. Vlo loads no AI code and sends nothing.' },
  reader: {
    label: 'Reader',
    summary: 'AI reads and gives notes in a side panel. It never writes your text.',
  },
  cowriter: {
    label: 'Co-writer',
    summary: 'AI can also draft when you ask. You choose what goes in, and Vlo marks it.',
  },
};

/** What a change to `mode` does, line by line, for the confirm step of the mode dialog. */
export function changesFor(
  mode: AiMode,
  project: { template: Template; aliasAiRequests: boolean },
): string[] {
  if (mode === 'pen')
    return [
      'The Assistant panel closes, and Vlo stops loading its AI code for this project.',
      'Vlo sends nothing. The network log shows each request from before.',
      'Text that the AI wrote keeps its mark.',
    ];
  const lines = [
    'Vlo loads its AI code for this project. Other projects stay in their own mode.',
    'The Assistant panel opens beside your text. You pick the engine: in this browser, your own key or a server on your computer.',
    'Nothing leaves this device until you ask for something. Before each request, Vlo shows the exact text and where it goes.',
  ];
  lines.push(
    mode === 'reader'
      ? 'Answers stay in the panel and never enter your manuscript.'
      : 'When you ask, the AI drafts in the panel. Insert puts a draft in your text, and Vlo marks each AI word.',
  );
  if (project.template === 'memoir' && project.aliasAiRequests)
    lines.push('This memoir sends aliases, never real names.');
  return lines;
}

/** Stores the AI mode of a project. */
export async function setAiMode(projectId: string, mode: AiMode): Promise<void> {
  if (!MODES.includes(mode)) throw new RangeError(`Vlo has no AI mode "${mode}".`);
  const changed = await db.projects.update(projectId, {
    aiMode: mode,
    updatedAt: clock.now(),
  } satisfies Partial<Project>);
  if (changed === 0) {
    // Dexie counts 0 also when nothing changed, so check that the project is there.
    if ((await db.projects.get(projectId)) === undefined) throw new Error('This device has no such project.');
  }
}
