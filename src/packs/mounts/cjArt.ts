/**
 * Wilson's Pixelmator switch + lamp art (src/skins/carrier-jet/assets/{switches,lamps}/README.md) for the CJ hero
 * board. Every sprite is a transparent WebP at ~2x its display size. Toggle / guard sprites share one canvas per family
 * with the hex nut at the exact centre, so the art lands on the existing pivot with no layout change.
 * Lit = the function is on / in use AND BATT is on (the caller decides "on" from the rail's own state).
 */
const sw = import.meta.glob('../../skins/carrier-jet/assets/switches/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const lp = import.meta.glob('../../skins/carrier-jet/assets/lamps/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const pick = (m: Record<string, string>, dir: string, name: string): string => {
  const u = m[`../../skins/carrier-jet/assets/${dir}/${name}.webp`];
  if (!u) throw new Error(`cjArt: missing ${dir}/${name}.webp`);
  return u;
};
export type TgPos = 'up' | 'mid' | 'dn';
const POS: Record<TgPos, string> = { up: 'up', mid: 'neutral', dn: 'down' };

/** Unguarded hex toggle (380x780 canvas, nut centred). */
export const toggleSrc = (pos: TgPos, lit: boolean) => pick(sw, 'switches', `toggle-${POS[pos]}-${lit ? 'lit' : 'unlit'}`);

/**
 * Guarded toggle (460x1040 canvas, nut centred). red: AFTERBURNER; black (gunmetal): QUICK START, L/R FUEL.
 * Closed: the cover. Open: the lifted lid with the toggle at `pos`. The sheet has no lit down art: a guarded switch that
 * is down is off, so it is always unlit.
 */
export function guardSrc(color: 'red' | 'black' | 'yellow', open: boolean, pos: TgPos = 'mid', lit = false): string {
  const k = color === 'black' ? '-black' : color === 'yellow' ? '-yellow' : '';
  if (!open) return pick(sw, 'switches', `guard-closed${k}`);
  // yellow (QUICK START, the red art re-hued): unlit only, its lamp sits over the nut
  if (pos === 'dn' || color === 'yellow') return pick(sw, 'switches', `guarded-${color === 'yellow' && pos !== 'dn' ? POS[pos] : 'down'}-unlit${k}`);
  return pick(sw, 'switches', `guarded-${POS[pos]}-${lit ? 'lit' : 'unlit'}${k}`);
}

export type RoundMode = 'off' | 'powered' | 'lit';
/** Small round lamp: off (BATT off), powered (BATT on, item inactive), lit (item active). */
export const roundSrc = (color: 'amber' | 'green' | 'red', mode: RoundMode) => pick(lp, 'lamps', `small-${color}-${mode}`);
export const roundMode = (batt: boolean, test: boolean, active: boolean): RoundMode => (!batt ? 'off' : test || active ? 'lit' : 'powered');

/** MASTER CAUTION / MASTER WARNING square lamp (sheet art at its true square aspect, printed text taken out; the HTML
 * legend stays). Red round lamps (GEN) are Wilson's amber lamp re-hued (assets/lamps/README.md). */
export const masterSrc = (id: 'masterCaution' | 'masterWarning', lit: boolean) =>
  pick(lp, 'lamps', `master-${id === 'masterCaution' ? 'caution' : 'warning'}-${lit ? 'lit' : 'unlit'}-sq`);

/** Square keys: full lamp (whole face lights), 1/3 lamp (lit legend strip), plain push (unpressed / pressed). */
export const squareFullSrc = (lit: boolean) => pick(lp, 'lamps', `square-full-${lit ? 'lit' : 'unlit'}`);
/** SHUTDOWN: the full lamp re-hued to red (same treatment as the red GEN lamps). */
export const squareFullRedSrc = (lit: boolean) => pick(lp, 'lamps', `square-full-red-${lit ? 'lit' : 'unlit'}`);
/** BATT off (unpowered): Wilson's unlit faces darkened, so nothing reads as lit on a bright car screen. */
export const darkSrc = (kind: 'master' | 'full' | 'fullRed' | 'third') =>
  pick(lp, 'lamps', kind === 'master' ? 'master-caution-dark-sq' : kind === 'full' ? 'square-full-dark' : kind === 'fullRed' ? 'square-full-red-dark' : 'square-third-dark');
export const squareThirdSrc = (lit: boolean) => pick(lp, 'lamps', `square-third-${lit ? 'lit' : 'unlit'}`);
export const pushSquareSrc = (pressed: boolean) => pick(lp, 'lamps', `push-square-${pressed ? 'on' : 'off'}`);

/** Lamp TEST push (Wilson's PUSH UNLIT / PUSH LIT: chrome hex nut, brushed round face, red ring lit while held). */
export const pushHexSrc = (lit: boolean) => pick(sw, 'switches', `push-hex-${lit ? 'lit' : 'unlit'}`);
