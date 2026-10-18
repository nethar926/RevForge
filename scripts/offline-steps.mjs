/**
 * Deterministic OfflineAudioContext suspend points (offline renders / tests only).
 *
 * node-web-audio-api implements suspend() and startRendering() as `#[napi] async fn`s that run
 * on a tokio multi-thread runtime, so a suspend(t) call is only registered when a runtime worker
 * polls its task. web-audio-api-rs refuses a suspend once startRendering has taken the renderer
 * ("cannot suspend when rendering has already started") — and because it panics while holding
 * the renderer mutex, the mutex is poisoned and every later suspend is refused too. Under CPU
 * load the startRendering task can be polled on another worker before a block of pending
 * suspend tasks: those points silently disappear (setDriving / cues / probes missing for that
 * stretch, the render differs run to run, and the old harness only logged it under RF_DEBUG).
 *
 * Fix, three parts:
 * 1. TOKIO_WORKER_THREADS=1 for this process (set before node-web-audio-api starts its runtime;
 *    import this module first). One worker drains the runtime's FIFO queue in order. Render
 *    output does not depend on the thread count (the renderer itself is single-threaded).
 * 2. armSuspends() registers the points in order, then queues one sentinel suspend past the end of
 *    the render and waits for it to be refused. That refusal comes from the time check that runs
 *    BEFORE the renderer lock is taken (no poisoning), and the sentinel's task is polled after every
 *    earlier suspend task, so once it settles every point is registered. Only then may the caller
 *    call startRendering.
 * 3. Any point the context still refuses is reported in `missed`; callers throw on it
 *    (assertNoMissed) instead of rendering with a hole.
 */
if (!process.env.TOKIO_WORKER_THREADS) process.env.TOKIO_WORKER_THREADS = '1';

/**
 * @param {OfflineAudioContext} ctx  not yet rendering
 * @param {number[]} times           suspend times (s), ascending, ≥ one render quantum apart
 * @param {(t: number, i: number) => unknown} onReach  runs at each point; must resume the context
 * @returns {Promise<{ settled: Promise<void>, missed: string[] }>}  resolves once every point is
 *   registered (call startRendering after that); check `missed` after rendering. `settled`
 *   resolves when every callback ran.
 */
export async function armSuspends(ctx, times, onReach) {
  const missed = [];
  const settled = times.map((t, i) =>
    ctx.suspend(t).then(
      () => onReach(t, i),
      (err) => {
        missed.push(`${t}: ${err?.name ?? 'Error'}: ${err?.message ?? err}`);
      },
    ),
  );
  // barrier: a suspend past the end is refused by the time check (outside the renderer lock)
  await ctx.suspend(ctx.length / ctx.sampleRate + 1).then(
    () => {
      throw new Error('armSuspends: sentinel suspend past the render end was accepted');
    },
    () => {},
  );
  return { settled: Promise.all(settled).then(() => undefined), missed };
}

/** Throw if any suspend point was refused (a render with a hole is not a valid result). */
export function assertNoMissed(missed, where) {
  if (missed.length) {
    throw new Error(
      `${where}: ${missed.length} offline suspend point(s) refused (first: ${missed[0]}); ` +
        `TOKIO_WORKER_THREADS=${process.env.TOKIO_WORKER_THREADS} — was node-web-audio-api's runtime started before scripts/offline-steps.mjs was imported?`,
    );
  }
}
