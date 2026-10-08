import { PACK_THEME_MIGRATIONS, THEME_ID_MIGRATIONS } from '../packs/migrations';
import type { PackIdentity } from '../packs/types';
import { FALLBACK_THEME_ID, FORCED_VISIBLE_IDS, isThemeListed, resolveListedThemeId } from './visibility';
export { VISIBLE_THEME_IDS, FALLBACK_THEME_ID, isThemeListed } from './visibility';
export type ThemeFamily = 'Minimal' | 'Gauge Cluster' | 'Cockpit' | 'RoadView' | 'Full Screen';
export type ThemeLayout = 'numerical' | 'arc' | 'line' | 'bar' | 'digital' | 'analog' | 'driver' | 'scanner' | 'time' | 'jet' | 'space' | 'road' | 'custom' | 'gradient' | 'gradient-macro';
export interface ThemePreset { id: string; name: string; family: ThemeFamily; group: string; layout: ThemeLayout | 'pack'; accent: string; secondary: string; description: string; feature: string; sceneId?: string; }
const skin = (id: string, name: string, family: ThemeFamily, group: string, layout: ThemeLayout, accent: string, secondary: string, description: string, feature: string): ThemePreset => ({id,name,family,group,layout,accent,secondary,description,feature});
export const THEMES: ThemePreset[] = [
  skin('custom-grid','RF Your Grid','Gauge Cluster','Custom','custom','#8fe8f3','#faad58','Your own arrangement of instruments.','Editable instrument grid'),
  skin('lightbike','RF Photon Cycle','Gauge Cluster','SciFi','arc','#4ef3ff','#ffb14c','An electric cycle instrument with a luminous speed core.','Photon tach ring'),
  skin('galactic-enforcer','Galactic Enforcer','Cockpit','SciFi','space','#76cce9','#ff465d','Twin-Ion combat instruments, sensor pods and a dynamic targeting scope.','Simulated acquisition and target lock'),
  skin('minimal-numeric','RF Aperture','Minimal','Numerical','numerical','#a5efdc','#4d75b9','A single speed readout floating over an RPM-reactive gradient.','RPM atmosphere'),
  skin('minimal-arc','RF Orbit Trace','Minimal','Arc','arc','#a8d9ff','#4763a2','A sweeping tachometer around a central digital speedometer.','Redline glow'),
  skin('minimal-line','RF Vector Rail','Minimal','Line','line','#f3b575','#945b38','Left-aligned speed, a continuous speed rail and compact telemetry.','Live telemetry rails'),
  skin('minimal-bar','RF Bitstream','Minimal','Line','bar','#a3f1a1','#398b61','Stepped luminous bars and a crisp retro digital readout.','Discrete LED steps'),
  skin('c4','RF Amber Matrix','Gauge Cluster','Retro','digital','#eec960','#70dca4','Wide digital speed, rising tach blocks and an amber eighties glow.','Rising block tach'),
  skin('z31','RF Jade Horizon','Gauge Cluster','Retro','digital','#61dbc8','#eaab5c','A turquoise digital horizon, twin telemetry banks and turbo-era geometry.','Load ladder'),
  skin('trans-am','RF Ember Dial','Gauge Cluster','Retro','analog','#ea8547','#e5c789','Deep orange instruments, twin round dials and a driver-first center pod.','Amber twin needles'),
  skin('2002','RF Ivory Sprint','Gauge Cluster','Retro','analog','#e9e3cc','#e46639','Clean ivory markings, restrained orange needles and a compact center clock.','Shift telltale'),
  skin('duetto','RF Rosso Pair','Gauge Cluster','Retro','analog','#e9d6b0','#ea6a55','Two deep-set round instruments, warm ivory indices and fine red needles.','Twin instrument binnacles'),
  skin('reventon','RF Slate Vector','Gauge Cluster','Modern','jet','#b8e594','#e9efdd','Faceted aviation-style instrumentation, linear tapes and a central speed display.','Tactical display grid'),
  skin('model-s','RF Quiet Horizon','Gauge Cluster','Modern','driver','#e4e9ef','#65c5d0','Wide horizon, restrained telemetry and a central vehicle silhouette.','Motion horizon'),
  skin('model-3','RF Stillwater','Gauge Cluster','Modern','numerical','#e6edf7','#819bb5','Quiet typography, abundant space and a cool, responsive backdrop.','Calm speed focus'),
  skin('720','RF Track Ribbon','Gauge Cluster','Modern','arc','#ff9751','#dadfe8','A low horizontal instrument pod with a vivid orange tachometer.','Compact track display'),
  skin('lfa','RF Crescendo','Gauge Cluster','Modern','arc','#f1f3ef','#e86257','A large central tach ring with sequential shift lamps and a gear core.','Sequential shift lamps'),
  skin('tt','RF Splitline','Gauge Cluster','Modern','driver','#dce7f1','#ed5958','Balanced digital instruments flanking a live driving horizon.','Dual information panes'),
  skin('epoch-banks','RF Epoch Banks','Full Screen','Retro','time','#efbd64','#7cdda2','Target, current and last-jump date banks with a physical-style date keypad.','Speed-triggered date jump'),
  skin('night-pursuit','Night Pursuit','Full Screen','Experimental','scanner','#ff2a1f','#ffb000','Experimental pack: an eighties pursuit-car command dash — red scanner across the top, 7-segment SPEED/RPM, LED bar banks, twin CRT pods and a cross-plane V8.','Scanner sweep · linked V8'),
  skin('gradient','RF Gradient Sweep','Gauge Cluster','Gradient','gradient','#ff5353','#4da6ff','Twin conic light-sweep dials — MPH left, RPM right — around a glowing center stack. Part of the Gradient pack.','Conic light sweep'),
  skin('gradient-macro','RF Gradient Macro','Gauge Cluster','Gradient','gradient-macro','#4da6ff','#ff8a3c','A single macro beam gauge — one bright sweep across a deep-blue face with etched ticks and dark-navy numerals. Part of the Gradient pack.','Macro beam gauge'),
  skin('f22','RF Peregrine','Cockpit','Jet','jet','#8eeeb0','#c8eabe','Angular HUD, paired engine-load tapes and a restrained radar panel.','Engine-load HUD'),
  skin('f35','RF Glasswing','Cockpit','Jet','jet','#9ee6df','#dbecf3','A panoramic glass panel with three live instrument windows.','Panoramic instrumentation'),
  skin('f14','RF Swingwing','Cockpit','Jet','analog','#97e6b0','#efa85e','Round engine instruments, green phosphor and a sweep display.','Original jet HUD + radar sweep'),
  skin('sr71','RF Nightglass','Cockpit','Jet','jet','#efab67','#d8dcc4','Amber edge lighting, dense engine tapes and a narrow center horizon.','Thermal-style load tapes'),
  skin('cargo-terminal','RF Cargo Terminal','Cockpit','SciFi','digital','#a5db92','#dad3a0','Industrial green terminal blocks, diagnostic grids and scanlines.','Terminal scanlines'),
  skin('white-spire','RF White Spire','Cockpit','SciFi','arc','#d1f4fc','#fc8c6b','A clean white circular interface with orange engine-load accents.','Reactive circular interface'),
  skin('cobalt-vane','RF Cobalt Vane','Cockpit','SciFi','space','#70d9ff','#96f3ad','Angular blue viewport, luminous edge outlines and a boost meter.','Boost visualization'),
  skin('visor-arc','RF Visor Arc','Cockpit','SciFi','space','#82c8ff','#d3e7a5','A blue visor-style overlay with a curved horizon and reactor status.','Reactor status arc'),
];
// Glob-registered experimental packs (src/packs/<id>.identity.ts) → Full Screen › Experimental.
for (const m of Object.values(import.meta.glob<{ default: PackIdentity }>('../packs/*.identity.ts', { eager: true }))) {
  const p = m.default;
  if (p && !THEMES.some((t) => t.id === p.id)) THEMES.push({ id: p.id, name: p.displayName, family: 'Full Screen', group: 'Experimental', layout: 'pack', accent: p.theme.accent, secondary: p.theme.secondary, description: p.theme.description, feature: p.theme.feature });
}
const roads = [
 ['light-grid','RF Light Grid','#4ef3ff','Night'],
 ['road-66','RF Copper Mile','#eda75d','Desert'],['apex-v8','RF Apex Dusk','#ec665d','Track'],['neon-drive','RF Violet Grid','#d286fa','Night'],['italia','RF Azure Bend','#efbe81','Coast'],['miami','RF Pink Current','#fa93c6','Night'],['autobahn','RF Silver Run','#8ecad9','Road'],['dual-surge','RF Lightline','#85d8ed','Road'],['dune-runner','RF Sandwake','#f0b569','Desert'],['alpine','RF Frostpass','#b8e4e9','Mountain'],['starliner','RF Deep Transit','#a3a2fb','Space'],['sakura-gtr','RF Blossom Run','#f0aeca','Coast'],['trenchlight','RF Trenchlight','#86dfb1','Space'],
];
for(const [id,name,accent,group] of roads) THEMES.push({...skin(`road-${id}`,name,'RoadView',group,'road',accent,'#9caac3','Procedural RevForge environment with speed-linked motion and atmospheric effects.','Reactive road atmosphere'),sceneId:id});
export const FAMILIES: ThemeFamily[] = ['Minimal','Gauge Cluster','Cockpit','RoadView','Full Screen'];
/**
 * Fresh-user theme. Was 'road-road-66'; that theme is hidden by the Oct 8 catalogue trim,
 * so the default moved to Night Pursuit (the trim fallback).
 */
export const DEFAULT_THEME = FALLBACK_THEME_ID;
/** RoadView scene used for atmosphere defaults and behind the locked IGNITION splash (unchanged). */
export const DEFAULT_ATMOSPHERE = 'road-road-66';
export const SPLASH_BACKDROP_THEME = DEFAULT_ATMOSPHERE;
/** Legacy Theme Lab ids → Trenchlight (craft-named Galactic Enforcer ids live reversed in packs/migrations.ts). */
export const RETIRED_THEME_IDS: Record<string, string> = {
  'road-tie-fighter': 'road-trenchlight',
  // Pack-owned legacy ids (decoded at runtime; see packs/migrations.ts).
  ...PACK_THEME_MIGRATIONS,
  // Retired franchise-named theme ids (stored reversed; see packs/migrations.ts).
  ...THEME_ID_MIGRATIONS,
};
export const themeForId = (id: string) => {
  const resolved = RETIRED_THEME_IDS[id] ?? id;
  return THEMES.find(t=>t.id===resolved) ?? THEMES.find(t=>t.id===DEFAULT_THEME)!;
};
/** The visible catalogue (allowlist in ./visibility) — the only themes any picker may list. */
export const LISTED_THEMES: readonly ThemePreset[] = THEMES.filter((t) => isThemeListed(t.id));
/** Saved / selected / deep-linked id → visible theme id (retired maps first, else Night Pursuit). */
export const resolveThemeId = (id: string | null | undefined) => {
  const resolved = resolveListedThemeId(id, RETIRED_THEME_IDS);
  // A VITE_FORCE_VISIBLE id that is not a theme (e.g. an engine id) never becomes the saved theme.
  return THEMES.some((t) => t.id === resolved) ? resolved : FALLBACK_THEME_ID;
};
/** VITE_FORCE_VISIBLE ids that matched a theme on this build (empty when unset). */
export const FORCED_THEME_IDS: readonly string[] = FORCED_VISIBLE_IDS.filter((id) => THEMES.some((t) => t.id === id));
