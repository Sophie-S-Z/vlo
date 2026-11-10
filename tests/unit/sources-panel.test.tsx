import { readFileSync } from 'node:fs';
import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { SourcesPanel } from '@/features/cite/SourcesPanel';
import { addSources, parseBibtex, useSources } from '@/features/cite/sources';
import { getSources, resetSources, setSources } from '@/features/cite/sourceStore';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { createProject } from '@/features/library/projects';
import { db } from '@/lib/db';

/* Roadmap 2 F64, plan Task M5: the Sources panel lists, adds, edits and deletes sources, with Undo. */

/** The panel with the live sources and style of a project, as the project screen gives them. */
function Host({ projectId }: { projectId: string }) {
  const sources = useSources(projectId);
  const style = useLiveQuery(async () => (await db.projects.get(projectId))?.settings.citeStyle, [projectId]);
  useEffect(() => {
    if (sources) setSources(projectId, sources, style);
  }, [projectId, sources, style]);
  return (
    <SourcesPanel
      editor={editor}
      onDone={() => {
        done += 1;
      }}
    />
  );
}

let projectId = '';
let editor: Editor;
let done = 0;

beforeEach(async () => {
  await db.open();
  done = 0;
  editor = new Editor({ element: document.createElement('div'), extensions: proseExtensions(new Y.Doc()) });
  editor.commands.setContent('<p>A night.</p>');
  ({
    project: { id: projectId },
  } = await createProject({ title: 'Essays', templates: ['open'] }));
  render(<Host projectId={projectId} />);
  await waitFor(() => {
    expect(getSources().projectId).toBe(projectId);
  });
});
afterEach(async () => {
  cleanup();
  editor.destroy();
  resetSources();
  await db.delete();
});

test('a typed source shows the fields of its type, and saves with a key from the author and year', async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add a source' }));
  const form = screen.getByRole('form', { name: 'Add a source' });
  fireEvent.change(within(form).getByLabelText('Type'), { target: { value: 'article' } });
  expect(within(form).getByLabelText('Journal')).toBeDefined();
  expect(within(form).queryByLabelText('Publisher')).toBeNull();
  fireEvent.change(within(form).getByLabelText('Authors'), { target: { value: 'Osei, Kwame' } });
  fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Tides and Timetables' } });
  fireEvent.change(within(form).getByLabelText('Year'), { target: { value: '2021' } });
  fireEvent.change(within(form).getByLabelText('Pages'), { target: { value: '201-219' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Added Tides and Timetables.')).toBeDefined();
  const [source] = await db.sources.toArray();
  expect(source).toMatchObject({ key: 'osei2021', type: 'article', pages: '201–219' });
  expect((await screen.findByRole('list', { name: 'Sources' })).textContent).toContain('Osei 2021');
});

test('a source with no title gives a message and stays out', async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add a source' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Type a title.');
  expect(await db.sources.count()).toBe(0);
});

test('a file imports, an edit saves, and Undo gives back a deleted source', async () => {
  const file = new File([readFileSync('tests/fixtures/sources/zotero.bib', 'utf8')], 'zotero.bib');
  fireEvent.change(screen.getByTestId('sources-input'), { target: { files: [file] } });
  expect(await screen.findByText('Added 4 sources.')).toBeDefined();
  await waitFor(() => {
    expect(within(screen.getByRole('list', { name: 'Sources' })).getAllByRole('listitem')).toHaveLength(4);
  });

  fireEvent.click(screen.getByRole('button', { name: 'Edit Lights on the Water' }));
  const form = screen.getByRole('form', { name: 'Edit source' });
  expect(within(form).getByLabelText<HTMLTextAreaElement>('Editors of the book').value).toBe('Hale, Mina');
  // A key does not change after the source is added.
  expect(within(form).queryByLabelText('Key')).toBeNull();
  fireEvent.change(within(form).getByLabelText('Pages'), { target: { value: '45-68' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Saved Lights on the Water.')).toBeDefined();
  expect((await db.sources.toArray()).find((s) => s.key === 'bjork_lights_2020')?.pages).toBe('45–68');

  fireEvent.click(screen.getByRole('button', { name: 'Delete Tides and Timetables' }));
  const undo = await screen.findByRole('button', { name: 'Undo' });
  expect(document.activeElement).toBe(undo);
  expect(await db.sources.count()).toBe(3);
  fireEvent.click(undo);
  expect(await screen.findByText('Restored Tides and Timetables.')).toBeDefined();
  expect(await db.sources.count()).toBe(4);
});

test('Cite puts a citation with the page at the cursor, and Style changes the style of the project', async () => {
  await addSources(projectId, parseBibtex(readFileSync('tests/fixtures/sources/zotero.bib', 'utf8')));
  fireEvent.change(await screen.findByLabelText('Page'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: /^Cite Night Ferry/ }));
  expect(done).toBe(1);
  expect(editor.getJSON().content[0]?.content?.at(-1)).toEqual({
    type: 'cite',
    attrs: { key: 'marlow_night_2019', page: '12' },
  });
  fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'mla' } });
  await waitFor(async () => {
    expect((await db.projects.get(projectId))?.settings.citeStyle).toBe('mla');
  });
  await waitFor(() => {
    expect(getSources().style).toBe('mla');
  });
});
