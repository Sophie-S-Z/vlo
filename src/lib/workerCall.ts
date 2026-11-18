/*
 * Calls to a module worker that answers each request by its id. The page side starts the worker with the
 * first call, so a writer who never uses a feature never loads its worker or its data. The worker side
 * answers each request in turn, and a failed request lets the next one try again.
 */

/** What a worker takes and what it gives back. */
export interface Protocol {
  request: unknown;
  result: unknown;
}

interface Call<Q> {
  id: number;
  request: Q;
}

type Reply<R> = { id: number; result: R } | { id: number; error: true };

/** One worker for the tab, made by `make` at the first call. A failed call rejects with `failed`. */
export function workerCaller<P extends Protocol>(
  make: () => Worker,
  failed: string,
): (request: P['request']) => Promise<P['result']> {
  type Q = P['request'];
  type R = P['result'];
  let worker: Worker | null = null;
  let nextId = 0;
  const waiting = new Map<number, { resolve: (result: R) => void; reject: (error: Error) => void }>();

  const start = (): Worker => {
    if (worker) return worker;
    const made = make();
    made.onmessage = (event: MessageEvent<Reply<R>>) => {
      const reply = event.data;
      const entry = waiting.get(reply.id);
      if (!entry) return;
      waiting.delete(reply.id);
      if ('error' in reply) entry.reject(new Error(failed));
      else entry.resolve(reply.result);
    };
    made.onerror = () => {
      for (const entry of waiting.values()) entry.reject(new Error(failed));
      waiting.clear();
      made.terminate();
      worker = null;
    };
    worker = made;
    return made;
  };

  return (request) => {
    const id = (nextId += 1);
    return new Promise<R>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      start().postMessage({ id, request } satisfies Call<Q>);
    });
  };
}

/** In a worker: answers each call with the result of `handle`, or with an error when it fails. */
export function answerCalls<P extends Protocol>(
  handle: (request: P['request']) => Promise<P['result']>,
): void {
  type Q = P['request'];
  type R = P['result'];
  // The page's type of `self` is a window. In a worker, `self` is the worker's own scope.
  const scope = self as unknown as {
    onmessage: ((event: MessageEvent<Call<Q>>) => void) | null;
    postMessage: (reply: Reply<R>) => void;
  };
  scope.onmessage = (event: MessageEvent<Call<Q>>) => {
    const { id, request } = event.data;
    handle(request).then(
      (result) => {
        scope.postMessage({ id, result } satisfies Reply<R>);
      },
      () => {
        scope.postMessage({ id, error: true } satisfies Reply<R>);
      },
    );
  };
}

/** Loads once and keeps the result. A failed load is forgotten, so the next call downloads again. */
export function loadOnce<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | null = null;
  return () => {
    loading ??= load().catch((error: unknown) => {
      loading = null;
      throw error;
    });
    return loading;
  };
}
