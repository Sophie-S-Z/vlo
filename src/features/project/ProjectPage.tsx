import { ViewTransition } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { projectTransitionName } from '@/features/library/ProjectCard';
import { TEMPLATES } from '@/features/library/templates';
import type { Item, Project } from '@/lib/db';
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
  const [params] = useSearchParams();
  const state = useProject(projectId);

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
  const item = openItem(project, items, params.get('item'));

  return (
    <ViewTransition name={projectTransitionName(project.id)}>
      <section>
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          {TEMPLATES[project.template].label}
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold [overflow-wrap:anywhere]">{project.title}</h1>
        {item && <h2 className="mt-8 font-display text-2xl font-semibold">{item.title}</h2>}
      </section>
    </ViewTransition>
  );
}
