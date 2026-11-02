import { PanelLeft } from 'lucide-react';
import { useState, ViewTransition } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMediaQuery } from '@/app/useMediaQuery';
import { Binder } from '@/features/binder/Binder';
import { projectTransitionName } from '@/features/library/ProjectCard';
import { TEMPLATES } from '@/features/library/templates';
import type { Item, Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/ui/dialog';
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
  const small = useMediaQuery('(max-width: 599px)');
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
  const item = openItem(project, items, params.get('item'));
  const open = (itemId: string) => {
    setParams({ item: itemId });
    setDrawer(false);
  };
  const binder = <Binder project={project} items={items} openItemId={item?.id ?? null} onOpen={open} />;

  return (
    <ViewTransition name={projectTransitionName(project.id)} update="none">
      <section className="grid gap-6 min-[600px]:grid-cols-[18rem_minmax(0,1fr)]">
        <header className="min-[600px]:col-span-2">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            {TEMPLATES[project.template].label}
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold [overflow-wrap:anywhere]">
            {project.title}
          </h1>
        </header>
        {small ? (
          <Dialog open={drawer} onOpenChange={setDrawer}>
            <DialogTrigger asChild>
              <Button variant="outline" className="justify-self-start">
                <PanelLeft aria-hidden="true" className="size-4" />
                Binder
              </Button>
            </DialogTrigger>
            <DialogContent className="top-0 left-0 h-dvh max-h-dvh w-[min(22rem,calc(100vw-2rem))] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0">
              <DialogTitle className="sr-only">Binder</DialogTitle>
              <DialogDescription className="sr-only">
                Pick an item to open, or reorder items.
              </DialogDescription>
              {binder}
            </DialogContent>
          </Dialog>
        ) : (
          <aside>{binder}</aside>
        )}
        <div>{item && <h2 className="font-display text-2xl font-semibold">{item.title}</h2>}</div>
      </section>
    </ViewTransition>
  );
}
