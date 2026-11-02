import { describe, expect, test } from 'vitest';
import {
  flattenTree,
  indentTarget,
  moveTarget,
  outdentTarget,
  projectDrop,
  type FlatNode,
} from '@/features/binder/tree';
import { TEMPLATES } from '@/features/library/templates';
import type { Item, ItemKind } from '@/lib/db';

function item(id: string, kind: ItemKind, parentId: string | null, order: string): Item {
  return {
    id,
    projectId: 'p',
    parentId,
    kind,
    title: id,
    status: 'draft',
    order,
    wordCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

// Novel: Chapter 1 (s1, s2), Chapter 2 (s3), Note. Rows are given out of order on purpose.
const novel: Item[] = [
  item('note', 'note', null, 'a2'),
  item('s2', 'scene', 'c1', 'a1'),
  item('c2', 'chapter', null, 'a1'),
  item('s1', 'scene', 'c1', 'a0'),
  item('c1', 'chapter', null, 'a0'),
  item('s3', 'scene', 'c2', 'a0'),
];

const ids = (nodes: FlatNode[]) => nodes.map((n) => `${'-'.repeat(n.depth)}${n.item.id}`);

describe('flattenTree', () => {
  test('lists parents before children, each level by order', () => {
    expect(ids(flattenTree(novel))).toEqual(['c1', '-s1', '-s2', 'c2', '-s3', 'note']);
  });

  test('keeps rows whose parent is missing at the top level, so nothing disappears', () => {
    expect(ids(flattenTree([item('lost', 'scene', 'gone', 'a0')]))).toEqual(['lost']);
  });
});

describe('projectDrop', () => {
  const nodes = flattenTree(novel);

  test('drags Scene 2 above Scene 1 in the same chapter', () => {
    const drop = projectDrop(nodes, 's2', 's1', 0, TEMPLATES.novel);
    expect(drop?.parentId).toBe('c1');
    expect(drop?.depth).toBe(1);
    expect(drop && drop.order < 'a0').toBe(true);
  });

  test('places a scene under another chapter', () => {
    const drop = projectDrop(nodes, 's1', 's3', 0, TEMPLATES.novel);
    expect(drop?.parentId).toBe('c2');
    expect(drop && drop.order > 'a0').toBe(true);
  });

  test('refuses a chapter under a scene in a novel', () => {
    // Chapter 2 dragged onto Scene 2 and pushed right, which would nest it inside Chapter 1.
    expect(projectDrop(nodes, 'c2', 's2', 1, TEMPLATES.novel)).toBeNull();
  });

  test('refuses a scene at the top level of a novel', () => {
    expect(projectDrop(nodes, 's3', 'note', -1, TEMPLATES.novel)).toBeNull();
  });

  test('refuses a poem under a poem', () => {
    const poems = flattenTree([item('p1', 'poem', null, 'a0'), item('p2', 'poem', null, 'a1')]);
    expect(projectDrop(poems, 'p2', 'p2', 1, TEMPLATES.poetry)).toBeNull();
  });

  test('allows a poem into a section', () => {
    const rows = flattenTree([item('sec', 'part', null, 'a0'), item('p1', 'poem', null, 'a1')]);
    const drop = projectDrop(rows, 'p1', 'p1', 1, TEMPLATES.poetry);
    expect(drop?.parentId).toBe('sec');
  });

  test('a chapter never moves inside itself', () => {
    const drop = projectDrop(nodes, 'c1', 's2', 1, TEMPLATES.novel);
    expect(drop?.parentId ?? null).not.toBe('c1');
  });
});

describe('menu moves', () => {
  const nodes = flattenTree(novel);

  test('Move up puts an item before its previous sibling', () => {
    const target = moveTarget(nodes, 's2', 'up');
    expect(target?.parentId).toBe('c1');
    expect(target && target.order < 'a0').toBe(true);
    expect(moveTarget(nodes, 's1', 'up')).toBeNull();
  });

  test('Move down puts an item after its next sibling', () => {
    const target = moveTarget(nodes, 'c1', 'down');
    expect(target?.parentId).toBeNull();
    expect(target && target.order > 'a1' && target.order < 'a2').toBe(true);
    expect(moveTarget(nodes, 'note', 'down')).toBeNull();
  });

  test('Indent moves an item to the end of its previous sibling, when the template allows it', () => {
    const target = indentTarget(nodes, 's2', TEMPLATES.novel);
    expect(target).toBeNull(); // a scene cannot hold a scene
    const memoir = flattenTree([item('part', 'part', null, 'a0'), item('m1', 'memory', null, 'a1')]);
    expect(indentTarget(memoir, 'm1', TEMPLATES.memoir)?.parentId).toBe('part');
  });

  test('Outdent moves an item after its parent, when the template allows it', () => {
    expect(outdentTarget(nodes, 's1', TEMPLATES.novel)).toBeNull(); // a scene cannot sit at the top level
    const memoir = flattenTree([
      item('part', 'part', null, 'a0'),
      item('m1', 'memory', 'part', 'a0'),
      item('m2', 'memory', null, 'a1'),
    ]);
    const target = outdentTarget(memoir, 'm1', TEMPLATES.memoir);
    expect(target?.parentId).toBeNull();
    expect(target && target.order > 'a0' && target.order < 'a1').toBe(true);
  });
});
