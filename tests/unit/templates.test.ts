import { describe, expect, test } from 'vitest';
import { TEMPLATES } from '@/features/library/templates';
import type { ItemKind, Template } from '@/lib/db';

const ALL: ItemKind[] = ['part', 'chapter', 'scene', 'memory', 'poem', 'note'];

describe('templates', () => {
  test('each template has only its own kinds', () => {
    expect(TEMPLATES.novel.kinds).toEqual(['part', 'chapter', 'scene', 'note']);
    expect(TEMPLATES.memoir.kinds).toEqual(['part', 'memory', 'note']);
    expect(TEMPLATES.poetry.kinds).toEqual(['part', 'poem', 'note']);
  });

  test('labels exist only for kinds the template uses', () => {
    for (const id of ['novel', 'memoir', 'poetry'] as Template[]) {
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
    for (const id of ['novel', 'memoir', 'poetry'] as Template[]) {
      const t = TEMPLATES[id];
      const writable = t.starter
        .flatMap((s) => [s, ...(s.children ?? [])])
        .filter((s) => t.editorKind(s.kind));
      expect(writable.length, id).toBeGreaterThan(0);
    }
  });
});
