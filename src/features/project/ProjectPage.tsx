import { useState, ViewTransition } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Binder } from '@/features/binder/Binder';
import { STATUS_LABEL } from '@/features/binder/BinderItem';
import { EditorPane } from '@/features/editor/EditorPane';
import { formatWords } from '@/features/library/format';
import { projectTransitionName } from '@/features/library/ProjectCard';
import { TEMPLATES } from '@/features/library/templates';
import type { Item, Project } from '@/lib/db';
import { ProjectLayout } from './ProjectLayout';
import { useProject } from './useProject';

/** The item to open: the one in the address, else the first item that has an editor. */
function openItem(project: Project, items: readonly Item[], requested: string | null): Item | undefined {
  const def = TEMPLATES[project.template];
  return (
    items.find((i) => i.id === requested && def.editorKind(i.kind) !== null) ??
    items.find((i) => def.editorKind(i.kind) !== null)
  );
}

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const state = useProject(projectId);
  const [drawer, setDrawer] = useState(false);

  if (state.status === 'loading') return null;

  if (state.status === 'missing') {
    return (
      <section>
        <h1 className="font-display text-4xl font-semibold">Project not found</h1>
        <p className="mt-4 text-muted">
          This device has no project at this address. It may have been deleted.
        </p>
        <p className="mt-6">
          <Link to="/">Go to the Library</Link>
        </p>
      </section>
    );
  }

  const { project, items } = state;
  const template = TEMPLATES[project.template];
  const item = openItem(project, items, params.get('item'));
  const kind = item ? template.editorKind(item.kind) : null;
  const totalWords = items.reduce((sum, i) => sum + i.wordCount, 0);
  const open = (itemId: string) => {
    setParams({ item: itemId });
    setDrawer(false);
  };

  return (
    <ViewTransition name={projectTransitionName(project.id)} update="none">
      <section>
        <ProjectLayout
          binderOpen={drawer}
          onBinderOpen={setDrawer}
          title={
            <header className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">{template.label}</p>
              <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
                {project.title}
              </h1>
            </header>
          }
          binder={<Binder project={project} items={items} openItemId={item?.id ?? null} onOpen={open} />}
          details={
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-muted">Project</dt>
                <dd className="font-mono">{formatWords(totalWords)}</dd>
              </div>
              {item && (
                <>
                  <div>
                    <dt className="text-muted">{template.kindLabel[item.kind] ?? item.kind}</dt>
                    <dd>{STATUS_LABEL[item.status]}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Synopsis</dt>
                    <dd>{item.synopsis ?? 'None yet. Add one from the binder item menu.'}</dd>
                  </div>
                </>
              )}
            </dl>
          }
          manuscript={(width) =>
            item && kind ? (
              <EditorPane key={item.id} item={item} kind={kind} width={width} />
            ) : (
              <p className="text-muted">Add an item from the binder to start writing.</p>
            )
          }
        />
      </section>
    </ViewTransition>
  );
}
