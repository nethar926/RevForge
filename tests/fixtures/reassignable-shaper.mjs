/**
 * node-web-audio-api still enforces the old "WaveShaper curve can only be set once" rule;
 * browsers allow re-assignment (EngineSynthImpl re-drives scream/howl shapers per frame).
 * Offline we keep the first curve: levels are representative, per-frame drive tweaks are not.
 */
export function allowShaperReassign(ctx) {
  const mk = ctx.createWaveShaper.bind(ctx);
  ctx.createWaveShaper = () => {
    const node = mk();
    let proto = Object.getPrototypeOf(node), desc;
    while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'curve'))) proto = Object.getPrototypeOf(proto);
    let set = false;
    Object.defineProperty(node, 'curve', {
      configurable: true,
      get: () => desc.get.call(node),
      set: (v) => { if (!set) { desc.set.call(node, v); set = v != null; } },
    });
    return node;
  };
  return ctx;
}
