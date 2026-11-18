import { render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { CustomizeToolbar } from '@/features/editor/toolbar/CustomizeToolbar';
import { pinnableTools } from '@/features/editor/toolbar/toolbarLayout';
import { MAX_PINNED, setWriterTools } from '@/features/editor/writerTools';

/* Phase 19, Task E1: the toolbar keeps at most MAX_PINNED tools, so the dialog says so at the limit. */

afterEach(() => {
  setWriterTools({ toolbar: null });
});

test('at the limit, the other tools cannot be pinned, and the dialog says why', () => {
  const tools = pinnableTools('prose');
  expect(tools.length).toBeGreaterThan(MAX_PINNED);
  setWriterTools({ toolbar: tools.slice(0, MAX_PINNED) });
  render(<CustomizeToolbar open onOpenChange={() => undefined} tools={tools} />);
  const others = screen.getByRole('list', { name: 'Tools in the menus only' });
  const pins = [...others.querySelectorAll('[role="switch"]')];
  expect(pins.length).toBeGreaterThan(0);
  for (const pin of pins) expect(pin.hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/Unpin a tool to pin another one/)).toBeTruthy();
});
