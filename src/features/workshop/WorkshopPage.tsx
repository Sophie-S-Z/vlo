import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { flattenTree } from '@/features/binder/tree';
import { withoutNotes } from '@/features/editor/format/notes';
import { projectDef } from '@/features/library/templates';
import { ProjectMissing } from '@/features/project/ViewNotices';
import { useProject } from '@/features/project/useProject';
import { ViewTabs } from '@/features/project/ViewTabs';
import { db, type Item, type Project } from '@/lib/db';
import { Segmented } from '@/ui/segmented';
import { CitationTool, HeadlineTool, SpineTool } from './ProseTools';
import { EchoesTool, EndingsTool, ErasureTool, ShovelTool } from './PoetryTools';
import { workshopTools, type WorkshopToolId } from './tools';

/*
 * The Workshop (Phase 17 decision D1): one screen of deeper tools for each mode, behind the More menu. A
 * poetry collection gets the most: erasure, golden shovel, echoes and line endings. Essays, articles and
 * research papers get the spine, and articles and papers get a tool of their own.
 */

/** An item that holds text, with its stored plain text without notes. */
export interface TextItem {
  item: Item;
  text: string;
}

/** The items that hold text, in binder order, with their stored text. It updates as the writer types. */
export function useTextItems(project: Project | null, items: readonly Item[]): TextItem[] | undefined {
  const ordered = useMemo(() => {
    if (!project) return [];
    const def = projectDef(project);
    return flattenTree(items)
      .map((node) => node.item)
      .filter((item) => def.editorKind(item.kind) !== null && item.role === undefined);
  }, [project, items]);
  // While the query runs again after a change, the last list stays. A tool that unmounts loses its work.
  return useLiveQuery(async () => {
    const texts = await db.itemTexts.bulkGet(ordered.map((i) => i.id));
    return ordered.map((item, i) => ({ item, text: withoutNotes(texts[i]?.text ?? '') }));
  }, [ordered]);
}

export function WorkshopPage() {
  const { projectId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const state = useProject(projectId);
  const project = state.status === 'ready' ? state.project : null;
  const items = state.status === 'ready' ? state.items : [];
  const texts = useTextItems(project, items);

  useDocumentTitle(
    project ? `${project.title}, Workshop` : state.status === 'missing' ? 'Project not found' : 'Workshop',
  );

  if (state.status === 'loading') return null;
  if (state.status === 'missing' || !project) return <ProjectMissing />;

  const template = projectDef(project);
  const tools = workshopTools(project.templates);
  const asked = search.get('tool');
  const tool = tools.find((t) => t.id === asked) ?? tools[0];

  return (
    <section className="grid gap-8">
      <header className="min-w-0">
        <p className="text-sm text-muted">{template.label}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere]">{project.title}</h1>
      </header>
      <ViewTabs project={project} />
      <div className="grid gap-2">
        <h2 className="font-display text-2xl font-semibold">Workshop</h2>
        {!tool ? (
          <p className="max-w-prose text-muted">
            The Workshop has tools for poetry collections, essays, articles and research papers. This project
            has none of them.
          </p>
        ) : (
          <>
            {tools.length > 1 && (
              <div className="max-w-full overflow-x-auto">
                <Segmented<WorkshopToolId>
                  label="Workshop tool"
                  options={tools.map((t) => ({ value: t.id, label: t.label }))}
                  value={tool.id}
                  onChange={(next) => {
                    setSearch(
                      (prev) => {
                        const out = new URLSearchParams(prev);
                        out.set('tool', next);
                        return out;
                      },
                      { replace: true },
                    );
                  }}
                />
              </div>
            )}
            <p className="max-w-prose text-muted">{tool.hint}</p>
          </>
        )}
      </div>
      {tool && texts === undefined && <p className="text-muted">Loading the text.</p>}
      {tool && texts !== undefined && (
        <div className="min-w-0">
          {tool.id === 'erasure' && <ErasureTool project={project} texts={texts} />}
          {tool.id === 'shovel' && <ShovelTool project={project} />}
          {tool.id === 'echoes' && <EchoesTool project={project} texts={texts} />}
          {tool.id === 'endings' && <EndingsTool project={project} texts={texts} />}
          {tool.id === 'spine' && <SpineTool project={project} texts={texts} />}
          {tool.id === 'headlines' && <HeadlineTool project={project} />}
          {tool.id === 'citations' && <CitationTool project={project} texts={texts} />}
        </div>
      )}
    </section>
  );
}
