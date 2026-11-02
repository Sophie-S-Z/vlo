import { ESLint } from 'eslint';
import { describe, expect, test } from 'vitest';

const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });
const NETWORK_MESSAGE = 'Only src/lib/net.ts may make network requests (VLO_SPEC section 10).';

async function networkErrors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${code};\nexport {};\n`, { filePath });
  return (result?.messages ?? []).filter((m) => m.message.includes(NETWORK_MESSAGE)).map((m) => m.message);
}

const banned = [
  "fetch('/a')",
  "window.fetch('/a')",
  "globalThis.fetch('/a')",
  "self.fetch('/a')",
  'new XMLHttpRequest()',
  "new WebSocket('wss://a')",
  "new EventSource('/a')",
  "navigator.sendBeacon('/a')",
];

describe('network lint rule', () => {
  test.each(banned)('flags %s outside net.ts', async (code) => {
    expect(await networkErrors(code, 'src/features/x.ts')).toHaveLength(1);
  });

  test('allows fetch inside src/lib/net.ts', async () => {
    expect(await networkErrors("fetch('/a')", 'src/lib/net.ts')).toHaveLength(0);
  });
});
