import { Link } from 'react-router';
import { TEMPLATES } from '@/features/library/templates';
import type { Project } from '@/lib/db';

/* The notices that each project view shows in place of its content. */

export function ProjectMissing() {
  return (
    <section>
      <h1 className="font-display text-4xl font-semibold">Project not found</h1>
      <p className="mt-4 text-muted">This device has no project at this address. It may have been deleted.</p>
      <p className="mt-6">
        <Link to="/">Go to the Library</Link>
      </p>
    </section>
  );
}

/** A sentence that names the project's templates, such as "This project is a novel." */
function whatItIs(project: Project): string {
  const names = project.templates.map((t) => TEMPLATES[t].label.toLowerCase());
  if (names.length === 1)
    return project.templates[0] === 'open'
      ? 'This project is open writing.'
      : `This project is ${/^[aeiou]/.test(names[0] ?? '') ? 'an' : 'a'} ${names[0] ?? ''}.`;
  const last = names.pop() ?? '';
  return `This project is a mix of ${names.join(', ')} and ${last}.`;
}

/** For a view of a template that the project does not have. `forWhom` is a sentence such as "The Story Board is for novel projects." */
export function WrongTemplate({ project, forWhom }: { project: Project; forWhom: string }) {
  return (
    <section>
      <h1 className="font-display text-4xl font-semibold [overflow-wrap:anywhere]">{project.title}</h1>
      <p className="mt-4 max-w-prose text-muted">
        {forWhom} {whatItIs(project)}
      </p>
      <p className="mt-6">
        <Link to={`/p/${project.id}`}>Go back to the writing</Link>
      </p>
    </section>
  );
}
