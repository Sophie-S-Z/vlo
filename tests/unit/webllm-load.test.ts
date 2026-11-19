import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/* Code review fix (spec section 10): a model load that ends after Pen mode or a cancel frees its model. */

const created: { unload: ReturnType<typeof vi.fn>; finish: () => void }[] = [];
let endAnswer: () => void = () => undefined;
const answered = new Promise<void>((resolve) => (endAnswer = resolve));

vi.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: () =>
    new Promise((resolve) => {
      const engine = {
        unload: vi.fn(() => Promise.resolve()),
        setInitProgressCallback: vi.fn(),
        reload: vi.fn(() => Promise.resolve()),
        interruptGenerate: vi.fn(),
        // An answer that streams one piece, then waits until the test ends it.
        chat: {
          completions: {
            create: () =>
              Promise.resolve(
                (async function* () {
                  yield { choices: [{ delta: { content: 'A' } }] };
                  await answered;
                })(),
              ),
          },
        },
      };
      created.push({
        unload: engine.unload,
        finish: () => {
          resolve(engine);
        },
      });
    }),
}));

class NoObserver {
  observe() {
    return undefined;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    return undefined;
  }
}

beforeEach(() => {
  created.length = 0;
  vi.stubGlobal('PerformanceObserver', NoObserver);
  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: { requestAdapter: () => Promise.resolve({}) },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'gpu');
});

/** Waits until the mocked library has started an engine. */
async function started(count: number) {
  await vi.waitFor(() => {
    expect(created).toHaveLength(count);
  });
}

describe('loadWebLlm', () => {
  test('an unload during the load frees the model and refuses the engine', async () => {
    const { loadWebLlm, unloadWebLlm, WEBLLM_MODELS, LOAD_CANCELLED } =
      await import('@/features/ai/engine/webllm');
    const model = WEBLLM_MODELS[0]?.id ?? '';
    const load = loadWebLlm(model, () => undefined);
    await started(1);
    await unloadWebLlm();
    created[0]?.finish();
    await expect(load).rejects.toThrow(LOAD_CANCELLED);
    expect(created[0]?.unload).toHaveBeenCalledTimes(1);

    // A cancel works the same way, and the next load starts a new engine.
    const { cancelWebLlmLoad } = await import('@/features/ai/engine/webllm');
    const second = loadWebLlm(model, () => undefined);
    await started(2);
    cancelWebLlmLoad();
    created[1]?.finish();
    await expect(second).rejects.toThrow(LOAD_CANCELLED);

    const third = loadWebLlm(model, () => undefined);
    await started(3);
    created[2]?.finish();
    await expect(third).resolves.toMatchObject({ id: 'webllm' });
    expect(created[2]?.unload).not.toHaveBeenCalled();
    await unloadWebLlm();
    expect(created[2]?.unload).toHaveBeenCalledTimes(1);
  });

  test('refuses to load another model while the model writes an answer', async () => {
    const { loadWebLlm, unloadWebLlm, WEBLLM_MODELS } = await import('@/features/ai/engine/webllm');
    const [first, second] = WEBLLM_MODELS;
    if (!first || !second) throw new Error('Vlo offers two models.');
    const load = loadWebLlm(first.id, () => undefined);
    await started(created.length + 1);
    created.at(-1)?.finish();
    const engine = await load;
    const answer = engine.generate({ system: '', messages: [], maxTokens: 8 })[Symbol.asyncIterator]();
    expect((await answer.next()).value).toBe('A');
    await expect(loadWebLlm(second.id, () => undefined)).rejects.toThrow(/busy/);
    endAnswer();
    expect((await answer.next()).done).toBe(true);
    await expect(loadWebLlm(second.id, () => undefined)).resolves.toMatchObject({ model: second.label });
    await unloadWebLlm();
  });
});
