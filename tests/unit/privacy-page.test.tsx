import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { HELP } from '@/features/help/help';
import { HelpPage } from '@/features/help/HelpPage';
import { PRIVACY } from '@/features/policy/privacy';
import { HOSTS } from '@/lib/net';

/* Plan Task F4: /privacy matches docs/privacy.md and names every network purpose; /help links only https. */

const doc = readFileSync('docs/privacy.md', 'utf8').replace(/\s+/g, ' ');

describe('the privacy page', () => {
  it('has an entry for each network purpose', () => {
    expect(Object.keys(PRIVACY.leaves).sort()).toEqual(Object.keys(HOSTS).sort());
  });

  it('matches docs/privacy.md, with the same version and date', () => {
    expect(doc).toContain(`Version ${String(PRIVACY.version)}, 13 November 2026.`);
    expect(PRIVACY.date).toBe('2026-11-13');
    for (const line of PRIVACY.stays) expect(doc).toContain(line);
    for (const entry of Object.values(PRIVACY.leaves)) {
      expect(doc).toContain(`### ${entry.title} ${entry.when} ${entry.sends}`);
    }
    expect(doc).toContain(PRIVACY.contact.url);
  });
});

describe('the Help page', () => {
  it('links only to https addresses, and each guide section has at most 6 steps', () => {
    for (const line of HELP.support) expect(new URL(line.url).protocol).toBe('https:');
    expect(new URL(PRIVACY.contact.url).protocol).toBe('https:');
    for (const section of HELP.guide) expect(section.steps.length).toBeLessThanOrEqual(6);
  });

  it('leaves out the sharing steps in a build with no Supabase project (plan decision T3)', () => {
    expect(HOSTS.share).toEqual([]);
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Export' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Share for reading' })).toBeNull();
  });
});
