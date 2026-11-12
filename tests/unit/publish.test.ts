import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Block, ExportDoc, Run } from '@/features/export/model';
import { bodyCopy, overLimits, postBody } from '@/features/publish/copy';
import { PLATFORMS, platformById, type Platform } from '@/features/publish/platforms';
import { authorizeUrl, readFragment, saveWpcomDraft } from '@/features/publish/wpcom';
import { toWxr } from '@/features/publish/wxr';
import { HOSTS } from '@/lib/net';
import { POEM_TEXT, poemUpdate, project, item } from './export-fixtures';
import { buildExportDoc } from '@/features/export/build';

/* Phase 17 Q-C: the Publish dialog's copies, import file and WordPress.com draft. */

const text = (value: string): Run => ({ type: 'text', text: value, style: {} });
const heading = (level: 1 | 2 | 3, value: string): Block => ({ type: 'heading', level, runs: [text(value)] });

const doc: ExportDoc = {
  title: 'Salt Year',
  font: 'lora',
  paper: 'letter',
  language: 'en',
  sections: [
    {
      id: 's1',
      title: 'Part One',
      form: null,
      blocks: [heading(1, 'Part One')],
    },
    {
      id: 's2',
      title: 'The Ferry',
      form: 'prose',
      blocks: [
        heading(2, 'The Ferry'),
        heading(3, 'At the dock'),
        {
          type: 'paragraph',
          runs: [
            text('The crossing took a night'),
            { type: 'footnote', number: 1, note: [{ type: 'text', text: 'In 1952.' }] },
            text('.'),
          ],
        },
        { type: 'paragraph', align: 'center', runs: [text('Coda')] },
      ],
    },
  ],
};

const platform = (id: string): Platform => {
  const found = platformById(id);
  if (!found) throw new Error(id);
  return found;
};

describe('the platforms', () => {
  test('each platform has a unique id, steps and a list of what it changes', () => {
    expect(new Set(PLATFORMS.map((p) => p.id)).size).toBe(PLATFORMS.length);
    expect(PLATFORMS).toHaveLength(15);
    for (const p of PLATFORMS) {
      expect(p.steps.length).toBeGreaterThan(0);
      expect(p.changes.length).toBeGreaterThan(0);
      if (p.body === 'markdown') expect(p.notes).toBeDefined();
    }
  });
});

describe('the copy for each platform', () => {
  test('Medium gets two heading sizes and no centered text', () => {
    const { html } = postBody(doc, platform('medium'));
    expect(html).toContain('<h3>Part One</h3>');
    expect(html).toContain('<h4>The Ferry</h4>');
    expect(html).toContain('<h4>At the dock</h4>');
    expect(html).not.toMatch(/align=|<h2/);
    // The note goes at the end as a numbered list.
    expect(html).toContain('<sup>1</sup>');
    expect(html).toMatch(/<hr>\n<ol><li>In 1952\.<\/li><\/ol>$/);
  });

  test('Wattpad has no headings, so each one is a bold line, and centered text stays', () => {
    const { html } = postBody(doc, platform('wattpad'));
    expect(html).not.toMatch(/<h[2-4]/);
    expect(html).toContain('<p><strong>At the dock</strong></p>');
    expect(html).toContain('<p align="center">Coda</p>');
  });

  test('AO3 gets the HTML itself as text, and the default headings', () => {
    const p = platform('ao3');
    const body = postBody(doc, p);
    expect(body.html).toContain('<h2>Part One</h2>');
    expect(bodyCopy(p, body, 'Salt Year')).toEqual({ text: body.html });
  });

  test('Substack gets rich text with a plain text copy beside it', () => {
    const p = platform('substack');
    const body = postBody(doc, p);
    const copy = bodyCopy(p, body, 'Salt Year');
    expect(copy.html).toBe(body.html);
    expect(copy.text).toContain('The crossing took a night[1].');
  });

  test('Markdown sites get headings one level down and notes as a list', () => {
    const p = platform('reddit');
    const { markdown } = postBody(doc, p);
    expect(markdown).toContain('## Part One');
    expect(markdown).toContain('### The Ferry');
    expect(markdown).toContain('The crossing took a night[1].');
    expect(markdown).toMatch(/---\n\n1\. In 1952\.\n$/);
    expect(markdown).not.toContain('[^1]');
    // Reddit reads the title from its own field.
    expect(bodyCopy(p, postBody(doc, p), 'Salt Year').text).not.toContain('# Salt Year');
  });

  test('a Markdown editor gets [^1] footnotes, and Write.as takes the title from the first line', () => {
    const { markdown } = postBody(doc, platform('markdown'));
    expect(markdown).toContain('night[^1].');
    expect(markdown).toContain('[^1]: In 1952.');
    const writeas = platform('writeas');
    expect(bodyCopy(writeas, postBody(doc, writeas), ' Salt Year ').text).toMatch(
      /^# Salt Year\n\n## Part One/,
    );
  });

  test('a poem keeps every indent in the Markdown, as no-break spaces', () => {
    const poem = buildExportDoc({
      project: project('poetry'),
      items: [item('p1', 'poem', 'Salt on the Sill')],
      scope: { kind: 'item', itemId: 'p1' },
      updates: new Map([['p1', poemUpdate()]]),
    });
    const { markdown } = postBody(poem, platform('devto'));
    const lines = markdown
      .replace(/\\\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .trimEnd()
      .split('\n');
    for (const line of POEM_TEXT.trimEnd()
      .split('\n')
      .filter((l) => l !== ''))
      expect(lines).toContain(line);
  });

  test('a copy over a platform limit says so', () => {
    const p = platform('reddit');
    const long: ExportDoc = {
      ...doc,
      sections: [
        {
          id: 'x',
          title: 'x',
          form: 'prose',
          blocks: [{ type: 'paragraph', runs: [text('a'.repeat(40_001))] }],
        },
      ],
    };
    expect(overLimits(p, postBody(long, p), 'Short')).toEqual([
      'Reddit takes at most 40,000 characters in one post. This copy has 40,002, so post it in parts.',
    ]);
    expect(overLimits(p, postBody(doc, p), 'x'.repeat(301))[0]).toMatch(/at most 300 characters/);
    expect(overLimits(platform('substack'), postBody(long, platform('substack')), 'Short')).toEqual([]);
  });
});

describe('the WordPress import file', () => {
  test('holds one draft post, and a "]]>" in the text cannot break it', () => {
    const xml = toWxr({
      title: 'A ]]> B',
      excerpt: 'Tides',
      html: '<p>x ]]> y</p>',
      at: Date.UTC(2026, 10, 12, 9, 30),
    });
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(xml).toContain('<wp:wxr_version>1.2</wp:wxr_version>');
    const post = parsed.getElementsByTagName('item')[0];
    expect(post?.getElementsByTagName('title')[0]?.textContent).toBe('A ]]> B');
    expect(post?.getElementsByTagName('content:encoded')[0]?.textContent).toBe('<p>x ]]> y</p>');
    expect(post?.getElementsByTagName('wp:status')[0]?.textContent).toBe('draft');
    expect(post?.getElementsByTagName('wp:post_date')[0]?.textContent).toBe('2026-11-12 09:30:00');
  });
});

describe('a draft on WordPress.com', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('the publish purpose reaches only the WordPress.com API', () => {
    expect(HOSTS.publish).toEqual(['public-api.wordpress.com']);
  });

  test('the sign-in asks for a token, and the answer must carry the same state', () => {
    const url = new URL(authorizeUrl('123', 'abc'));
    expect(url.host).toBe('public-api.wordpress.com');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/wpcom-callback\.html$/);
    const fragment = '#access_token=t%2B1&expires_in=1209600&token_type=bearer&site_id=42&state=abc';
    expect(readFragment(fragment, 'abc', 1000)).toEqual({
      token: 't+1',
      siteId: '42',
      expiresAt: 1000 + 1_209_600_000,
    });
    expect(readFragment(fragment, 'other', 1000)).toBeNull();
    expect(readFragment('#state=abc&site_id=42', 'abc', 1000)).toBeNull();
  });

  test('the draft goes to the picked site with the token, and the answer gives the edit page', async () => {
    const fetch = vi.fn<(url: URL | string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify({ ID: 7, site_ID: 42 }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetch);
    const draft = await saveWpcomDraft(
      { token: 'tok', siteId: '42', expiresAt: Date.now() + 3_600_000 },
      { title: 'Salt Year', html: '<p>x</p>', excerpt: '' },
    );
    expect(draft.editUrl).toBe('https://wordpress.com/post/42/7');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://public-api.wordpress.com/rest/v1.1/sites/42/posts/new');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok' });
    expect(JSON.parse(init?.body as string)).toMatchObject({ status: 'draft', title: 'Salt Year' });
  });

  test('a refused token asks for a new sign-in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 403 }))),
    );
    await expect(
      saveWpcomDraft(
        { token: 'old', siteId: '42', expiresAt: Date.now() + 3_600_000 },
        { title: 't', html: '', excerpt: '' },
      ),
    ).rejects.toThrow(/new sign-in/);
  });
});
