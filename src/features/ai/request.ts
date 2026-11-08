import type { JSONContent } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { docBody } from '@/features/editor/itemText';
import { leafText } from '@/features/editor/leafText';
import { hasTemplate, projectDef } from '@/features/library/templates';
import { privatePeople } from '@/features/people/people';
import { db, type Item, type Project } from '@/lib/db';
import type { PrivatePerson } from '@/lib/privacy';
import type { Target } from './assistantStore';
import { COWRITER_ACTIONS, cowriterRequest, type CowriterAction } from './cowriter';
import { withMarkedNames } from './names';
import { projectMarkedNames } from './projectNames';
import {
  checkFits,
  privateRequest,
  readerRequest,
  type AiRequest,
  type ItemContext,
  type ReaderAction,
} from './reader';
import { passagesOf, type Source } from './retrieve';

/*
 * The request that leaves for an AI engine (spec section 10, architecture review finding 3). The privacy
 * order lives here: the text, then the passages, then the people with every marked name, then the aliases,
 * then the size check. The Assistant panel only shows the result.
 */

export type ActionId = ReaderAction | CowriterAction;

export const isCowriterAction = (action: ActionId): action is CowriterAction =>
  COWRITER_ACTIONS.some((a) => a.id === action);

/** The most tokens of the writer's text in one request: small for the in-browser model. */
const BUDGET = { webllm: 1500, provider: 12000 } as const;
/** The most tokens of other passages for the in-browser model. Other engines take the default of 3,000. */
const WEBLLM_PASSAGES = 1000;
/** The in-browser models read 4,096 tokens. The rough count can be low, so a request stays under this. */
const WEBLLM_LIMIT = 3500;

export interface RequestInput {
  project: Project;
  items: readonly Item[];
  action: ActionId;
  question: string;
  words: number;
  instruction: string;
  topic: string;
  /** The open item and its editor state, which is newer than the stored copy. */
  open: { item: Item; kind: 'prose' | 'poem'; state: EditorState } | undefined;
  inBrowser: boolean;
}

export type BuiltRequest =
  | {
      ok: true;
      request: AiRequest;
      /** True when the aliases changed the request. */
      aliased: boolean;
      /** The people with each marked name as a variant, which also turn the answer back to real names. */
      people: PrivatePerson[];
      /** The words the writer selected for a rewrite, to replace on Insert. */
      target?: Target;
    }
  | { ok: false; message: string };

/** Builds the aliased and size-checked request, or gives the message that tells the writer why not. */
export async function buildAiRequest(input: RequestInput): Promise<BuiltRequest> {
  const { project, items, action, open } = input;
  const template = projectDef(project);
  const aliasOn = hasTemplate(project, 'memoir') && project.settings.aliasAiRequests;
  const budget = input.inBrowser ? BUDGET.webllm : BUDGET.provider;
  const context: ItemContext | undefined = open && {
    id: open.item.id,
    title: open.item.title,
    kind: (template.kindLabel[open.item.kind] ?? open.item.kind).toLowerCase(),
    text: docBody(open.state.doc, open.kind),
  };

  let request: AiRequest;
  let target: Target | undefined;
  try {
    if (isCowriterAction(action)) {
      if (!open || !context) throw new RangeError('Open an item first.');
      const { doc, selection } = open.state;
      const sep = open.kind === 'poem' ? '\n' : '\n\n';
      const selected = doc.textBetween(selection.from, selection.to, sep, leafText);
      request = cowriterRequest(action, {
        item: context,
        before: doc.textBetween(0, selection.from, sep, leafText),
        selection: selected,
        words: input.words,
        instruction: input.instruction,
        topic: input.topic,
        budget,
      });
      if (action === 'rewrite' || action === 'alternatives')
        target = { from: selection.from, to: selection.to, text: selected };
    } else {
      const needsAll = action === 'ask' || action === 'continuity';
      request = readerRequest(action, {
        ...(context ? { item: context } : {}),
        question: input.question,
        passages: needsAll ? await passages(project, items, context) : [],
        budget,
        ...(input.inBrowser ? { passageBudget: WEBLLM_PASSAGES } : {}),
      });
    }
  } catch (problem) {
    return {
      ok: false,
      message:
        problem instanceof RangeError ? problem.message : 'Vlo could not read the text for this request.',
    };
  }

  let people: PrivatePerson[] = [];
  if (aliasOn) {
    try {
      const openDoc = open && { id: open.item.id, doc: open.state.doc.toJSON() as JSONContent };
      const written = items.filter((i) => template.editorKind(i.kind) !== null);
      people = withMarkedNames(await privatePeople(project.id), await projectMarkedNames(written, openDoc));
    } catch {
      // A memoir request never goes without every person and every marked name.
      return {
        ok: false,
        message: 'Vlo could not read the private names of this memoir, so it sent nothing.',
      };
    }
  }

  const sent = privateRequest(request, people, aliasOn);
  if (input.inBrowser) {
    try {
      checkFits(sent, WEBLLM_LIMIT);
    } catch (problem) {
      return {
        ok: false,
        message: problem instanceof RangeError ? problem.message : 'This request is too long.',
      };
    }
  }
  return {
    ok: true,
    request: sent,
    aliased: aliasOn && sent !== request,
    people,
    ...(target ? { target } : {}),
  };
}

/** Every passage of the manuscript, with the open item read from the editor. Notes are research. */
async function passages(project: Project, items: readonly Item[], open: ItemContext | undefined) {
  const template = projectDef(project);
  const texts = await db.itemTexts.where('projectId').equals(project.id).toArray();
  const byId = new Map(items.map((i) => [i.id, i]));
  const sources: Source[] = [];
  for (const row of texts) {
    const it = byId.get(row.itemId);
    if (!it || it.kind === 'note' || template.editorKind(it.kind) === null) continue;
    sources.push({ itemId: it.id, title: it.title, text: open?.id === it.id ? open.text : row.text });
  }
  return passagesOf(sources);
}
