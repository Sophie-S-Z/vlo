import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

interface Header {
  key: string;
  value: string;
}
interface VercelConfig {
  buildCommand: string;
  outputDirectory: string;
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: Header[] }[];
}

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;

function headersFor(source: string): Record<string, string> {
  const entry = config.headers.find((h) => h.source === source);
  if (!entry) throw new Error(`No headers for ${source}`);
  return Object.fromEntries(entry.headers.map((h) => [h.key, h.value]));
}

function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    ([, body]) =>
      `'sha256-${createHash('sha256')
        .update(body ?? '')
        .digest('base64')}'`,
  );
}

describe('vercel.json', () => {
  test('builds the static app', () => {
    expect(config.buildCommand).toBe('npm run build');
    expect(config.outputDirectory).toBe('dist');
  });

  test('rewrites app routes to the app shell, but never static files', () => {
    expect(config.rewrites).toHaveLength(1);
    const [rewrite] = config.rewrites;
    expect(rewrite?.destination).toBe('/index.html');
    // Vercel sources use path-to-regexp. This source is one regex group, so a JavaScript RegExp reads it the same way.
    const pattern = new RegExp(`^${rewrite?.source ?? ''}$`);
    for (const path of ['/', '/settings', '/p/abc', '/p/abc/board', '/r/xyz', '/nope']) {
      expect(pattern.test(path), path).toBe(true);
    }
    // A missing hashed file must be a 404, never index.html served as "immutable" for a year.
    for (const path of [
      '/assets/index-X.js',
      '/icons/icon-192.png',
      '/sw.js',
      '/workbox-abc.js',
      '/manifest.webmanifest',
      '/fonts/lora/regular.ttf',
    ]) {
      expect(pattern.test(path), path).toBe(false);
    }
  });

  test('sends the security headers from spec section 12', () => {
    expect(headersFor('/(.*)')).toMatchObject({
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
  });

  test('the CSP keeps the strict parts of the spec policy', () => {
    const csp = headersFor('/(.*)')['Content-Security-Policy'] ?? '';
    for (const part of [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "media-src 'self' blob:",
      // The research view shows a PDF from a blob: URL in a frame (F41).
      "frame-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]) {
      expect(csp).toContain(part);
    }
    expect(csp).not.toContain('<');
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test('script-src allows wasm and exactly the inline scripts in index.html', () => {
    const csp = headersFor('/(.*)')['Content-Security-Policy'] ?? '';
    const scriptSrc =
      csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('script-src ')) ?? '';
    const hashes = inlineScriptHashes(readFileSync('index.html', 'utf8'));
    expect(hashes.length).toBeGreaterThan(0);
    expect(scriptSrc).toBe(["script-src 'self' 'wasm-unsafe-eval'", ...hashes].join(' '));
  });

  test('the service worker file is never cached by the browser', () => {
    expect(headersFor('/sw.js')).toMatchObject({ 'Cache-Control': 'no-cache' });
  });
});

describe('the outgoing hosts (architecture review after Phase 4)', () => {
  const connectSrc = () =>
    (headersFor('/(.*)')['Content-Security-Policy'] ?? '')
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('connect-src '))
      ?.split(/\s+/)
      .slice(1) ?? [];

  test('connect-src lists exactly the hosts of the network module', async () => {
    const { HOSTS } = await import('@/lib/net');
    const local = (host: string) => host.startsWith('localhost:');
    const expected = Object.values(HOSTS)
      .flat()
      .map((host) => `${local(host) ? 'http' : 'https'}://${host}`);
    expect([...connectSrc()].sort()).toEqual(["'self'", ...new Set(expected)].sort());
  });

  test('each AI preset goes to a host that the network module allows', async () => {
    const { hostAllowed } = await import('@/lib/net');
    const { PRESETS } = await import('@/features/ai/engine/presets');
    for (const preset of Object.values(PRESETS)) expect(hostAllowed(new URL(preset.base), 'ai')).toBe(true);
  });
});
