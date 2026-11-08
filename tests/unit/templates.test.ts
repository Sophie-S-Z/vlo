import { describe, expect, test } from 'vitest';
import {
  cleanTemplates,
  holdsText,
  projectDef,
  templateList,
  TEMPLATE_ORDER,
  TEMPLATES,
} from '@/features/library/templates';
import { togglePick, newPick } from '@/features/library/TemplatePicker';
import type { ItemKind } from '@/lib/db';

const ALL: ItemKind[] = ['part', 'chapter', 'scene', 'memory', 'poem', 'page', 'note'];

describe('templates', () => {
  test('each template has only its own kinds', () => {
    expect(TEMPLATES.novel.kinds).toEqual(['part', 'chapter', 'scene', 'note']);
    expect(TEMPLATES.memoir.kinds).toEqual(['part', 'memory', 'note']);
    expect(TEMPLATES.poetry.kinds).toEqual(['part', 'poem', 'note']);
  });

  test('labels exist only for kinds the template uses', () => {
    for (const id of TEMPLATE_ORDER) {
      const t = TEMPLATES[id];
      expect(Object.keys(t.kindLabel).sort()).toEqual([...t.kinds].sort());
      for (const kind of ALL.filter((k) => !t.kinds.includes(k))) {
        expect(t.childKinds.root ?? []).not.toContain(kind);
        for (const children of Object.values(t.childKinds)) expect(children).not.toContain(kind);
      }
    }
    expect(TEMPLATES.poetry.kindLabel.part).toBe('Section');
    expect(TEMPLATES.novel.kindLabel.part).toBe('Part');
  });

  test('editor kinds', () => {
    expect(TEMPLATES.poetry.editorKind('poem')).toBe('poem');
    expect(TEMPLATES.novel.editorKind('scene')).toBe('prose');
    expect(TEMPLATES.memoir.editorKind('memory')).toBe('prose');
    expect(TEMPLATES.novel.editorKind('note')).toBe('prose');
    expect(TEMPLATES.novel.editorKind('chapter')).toBeNull();
    expect(TEMPLATES.novel.editorKind('part')).toBeNull();
  });

  test('nesting rules', () => {
    expect(TEMPLATES.novel.childKinds.chapter).toEqual(['scene', 'note']);
    expect(TEMPLATES.novel.childKinds.scene ?? []).toEqual([]);
    expect(TEMPLATES.poetry.childKinds.poem ?? []).toEqual([]);
  });

  test('every starter item opens to something writable', () => {
    for (const id of TEMPLATE_ORDER) {
      const t = TEMPLATES[id];
      const writable = t.starter
        .flatMap((s) => [s, ...(s.children ?? [])])
        .filter((s) => t.editorKind(s.kind));
      expect(writable.length, id).toBeGreaterThan(0);
    }
  });

  test('open writing has folders, pages and notes, and a folder can hold a folder', () => {
    const open = TEMPLATES.open;
    expect(open.kinds).toEqual(['part', 'page', 'note']);
    expect(open.kindLabel.part).toBe('Folder');
    expect(open.childKinds.part).toEqual(['part', 'page', 'note']);
    expect(open.editorKind('page')).toBe('prose');
    expect(open.editorKind('part')).toBeNull();
    expect(open.starter).toEqual([{ kind: 'page', title: 'Page 1' }]);
  });
});

describe('mixed templates', () => {
  test('one template gives its own definition', () => {
    expect(projectDef(['memoir'])).toBe(TEMPLATES.memoir);
    expect(projectDef({ templates: ['open'] })).toBe(TEMPLATES.open);
  });

  test('several templates add their kinds, rules and starters, in template order', () => {
    const def = projectDef(['open', 'novel']);
    expect(def).toBe(projectDef(['novel', 'open']));
    expect(def.label).toBe('Novel + Open');
    expect(def.untitled).toBe('Untitled project');
    expect(def.kinds).toEqual(['part', 'chapter', 'scene', 'note', 'page']);
    // The first template that names a kind gives the label.
    expect(def.kindLabel.part).toBe('Part');
    expect(def.childKinds.root).toEqual(['part', 'chapter', 'note', 'page']);
    expect(def.childKinds.part).toEqual(['chapter', 'note', 'part', 'page']);
    expect(def.childKinds.chapter).toEqual(['scene', 'note']);
    expect(def.starter.map((s) => s.title)).toEqual(['Chapter 1', 'Page 1']);
    expect(projectDef(['poetry', 'open']).kindLabel.part).toBe('Section');
  });

  test('a mix of all four templates holds every kind', () => {
    const def = projectDef(TEMPLATE_ORDER);
    expect([...def.kinds].sort()).toEqual([...ALL].sort());
    expect(def.label).toBe('Novel + Memoir + Poetry + Open');
    for (const kind of ALL) expect(def.kindLabel[kind]).toBeTruthy();
    expect(holdsText(TEMPLATE_ORDER, 'page')).toBe(true);
    expect(holdsText(TEMPLATE_ORDER, 'chapter')).toBe(false);
  });

  test('clean lists keep template order, drop repeats and unknown names, and never come back empty', () => {
    expect(cleanTemplates(['open', 'novel', 'open'])).toEqual(['novel', 'open']);
    expect(cleanTemplates(['story'])).toEqual(['novel']);
    expect(cleanTemplates([])).toEqual(['novel']);
    expect(templateList(['open', 'memoir'])).toBe(templateList(['memoir', 'open']));
  });
});

describe('template pick', () => {
  test('the first pick replaces the suggestion, and later picks add or remove', () => {
    let pick = newPick();
    expect(pick).toEqual({ value: ['novel'], suggested: true });
    pick = togglePick(pick, 'poetry');
    expect(pick.value).toEqual(['poetry']);
    pick = togglePick(pick, 'open');
    pick = togglePick(pick, 'novel');
    expect(pick.value).toEqual(['novel', 'poetry', 'open']);
    pick = togglePick(pick, 'poetry');
    expect(pick.value).toEqual(['novel', 'open']);
  });

  test('the last template stays picked', () => {
    let pick = togglePick(newPick(), 'memoir');
    pick = togglePick(pick, 'memoir');
    expect(pick.value).toEqual(['memoir']);
    // A first click on the suggestion keeps it and ends the suggestion.
    expect(togglePick(newPick(), 'novel')).toEqual({ value: ['novel'], suggested: false });
  });
});
