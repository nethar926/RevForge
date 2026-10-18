/**
 * Fetch timeouts that hold even when the request (or a test stub) ignores its AbortSignal. Pure.
 * `p`, or a rejection as soon as `signal` aborts (whether or not whatever made `p` listens to the signal).
 */
export function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('aborted'));
  return new Promise<T>((ok, no) => {
    const onAbort = () => no(signal.reason ?? new Error('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); ok(v); },
      (e) => { signal.removeEventListener('abort', onAbort); no(e); },
    );
  });
}
