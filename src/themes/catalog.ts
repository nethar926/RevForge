import { PACK_THEME_MIGRATIONS } from '../packs/migrations';
export type ThemeFamily = 'Minimal' | 'Gauge Cluster' | 'Cockpit' | 'RoadView' | 'Full Screen';
export type ThemeLayout = 'numerical' | 'arc' | 'line' | 'bar' | 'digital' | 'analog' | 'driver' | 'scanner' | 'time' | 'jet' | 'space' | 'road' | 'custom' | 'new-worlds' | 'enterprise' | 'gradient' | 'gradient-macro';
export interface ThemePreset { id: string; name: string; family: ThemeFamily; group: string; layout: ThemeLayout; accent: string; secondary: string; description: string; feature: string; sceneId?: string; }
const skin = (id: string, name: string, family: ThemeFamily, group: string, layout: ThemeLayout, accent: string, secondary: string, description: string, feature: string): ThemePreset => ({id,name,family,group,layout,accent,secondary,description,feature});
export const THEMES: ThemePreset[] = [
  skin('custom-grid','RF Your Grid','Gauge Cluster','Custom','custom','#8fe8f3','#faad58','Your own arrangement of instruments.','Editable instrument grid'),
  skin('lightbike','RF Photon Cycle','Gauge Cluster','SciFi','arc','#4ef3ff','#ffb14c','An electric cycle instrument with a luminous speed core.','Photon tach ring'),
  skin('galactic-enforcer','Galactic Enforcer','Cockpit','SciFi','space','#76cce9','#ff465d','Twin-Ion combat instruments, sensor pods and a dynamic targeting scope.','Simulated acquisition and target lock'),
  skin('minimal-numeric','RF Aperture','Minimal','Numerical','numerical','#a5efdc','#4d75b9','A single speed readout floating over an RPM-reactive gradient.','RPM atmosphere'),
  skin('minimal-arc','RF Orbit Trace','Minimal','Arc','arc','#a8d9ff','#4763a2','A sweeping tachometer around a central digital speedometer.','Redline halo'),
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
  skin('time-machine','RF Chrono Banks','Full Screen','PopCulture','time','#efbd64','#7cdda2','Destination, present and departure time circuits with a physical-style date keypad.','88 MPH temporal transition'),
  skin('night-pursuit','Night Pursuit','Full Screen','Experimental','scanner','#ff2a1f','#ffb000','Experimental pack: an eighties pursuit-car command dash — red scanner across the top, 7-segment SPEED/RPM, LED bar banks, twin CRT pods and a cross-plane V8.','Scanner sweep · linked V8'),
  skin('new-worlds','RF New Worlds','Full Screen','PopCulture','new-worlds','#f5820d','#7d3c98','A free take on the LCARS command interface — Oswald numerals, warp rings and a segmented RPM bar.','Warp rings'),
  skin('enterprise','RF Enterprise','Full Screen','PopCulture','enterprise','#f5820d','#7d3c98','Strict LCARS command interface — Oswald numerals, warp rings and a chunky right-to-left RPM bar.','Warp rings'),
  skin('gradient','RF Gradient Sweep','Gauge Cluster','Gradient','gradient','#ff5353','#4da6ff','Twin conic light-sweep dials — MPH left, RPM right — around a glowing center stack. Part of the Gradient pack.','Conic light sweep'),
  skin('gradient-macro','RF Gradient Macro','Gauge Cluster','Gradient','gradient-macro','#4da6ff','#ff8a3c','A single macro beam gauge — one bright sweep across a deep-blue face with etched ticks and dark-navy numerals. Part of the Gradient pack.','Macro beam gauge'),
  skin('f22','RF Peregrine','Cockpit','Jet','jet','#8eeeb0','#c8eabe','Angular HUD, paired engine-load tapes and a restrained radar panel.','Engine-load HUD'),
  skin('f35','RF Glasswing','Cockpit','Jet','jet','#9ee6df','#dbecf3','A panoramic glass panel with three live instrument windows.','Panoramic instrumentation'),
  skin('f14','RF Swingwing','Cockpit','Jet','analog','#97e6b0','#efa85e','Round engine instruments, green phosphor and a sweep display.','Original jet HUD + radar sweep'),
  skin('sr71','RF Nightglass','Cockpit','Jet','jet','#efab67','#d8dcc4','Amber edge lighting, dense engine tapes and a narrow center horizon.','Thermal-style load tapes'),
  skin('nostromo','RF Cargo Terminal','Cockpit','SciFi','digital','#a5db92','#dad3a0','Industrial green terminal blocks, diagnostic grids and scanlines.','Terminal scanlines'),
  skin('oblivion','RF White Spire','Cockpit','SciFi','arc','#d1f4fc','#fc8c6b','A clean white circular interface with orange engine-load accents.','Reactive circular interface'),
  skin('starfox','RF Blue Comet','Cockpit','SciFi','space','#70d9ff','#96f3ad','Angular blue viewport, luminous wing outlines and a boost meter.','Boost visualization'),
  skin('halo','RF Ringfall','Cockpit','SciFi','space','#82c8ff','#d3e7a5','A blue helmet-style overlay with a curved horizon and reactor status.','Reactor status arc'),
];
const roads = [
 ['light-grid','RF Light Grid','#4ef3ff','Night'],
 ['road-66','RF Copper Mile','#eda75d','Desert'],['apex-v8','RF Apex Dusk','#ec665d','Track'],['neon-drive','RF Violet Grid','#d286fa','Night'],['italia','RF Azure Bend','#efbe81','Coast'],['miami','RF Pink Current','#fa93c6','Night'],['autobahn','RF Silver Run','#8ecad9','Road'],['plaid','RF Lightline','#85d8ed','Road'],['dune-runner','RF Sandwake','#f0b569','Desert'],['alpine','RF Frostpass','#b8e4e9','Mountain'],['starliner','RF Deep Transit','#a3a2fb','Space'],['sakura-gtr','RF Blossom Run','#f0aeca','Coast'],['trenchlight','RF Trenchlight','#86dfb1','Space'],
];
for(const [id,name,accent,group] of roads) THEMES.push({...skin(`road-${id}`,name,'RoadView',group,'road',accent,'#9caac3','Procedural RevForge environment with speed-linked motion and atmospheric effects.','Reactive road atmosphere'),sceneId:id});
export const FAMILIES: ThemeFamily[] = ['Minimal','Gauge Cluster','Cockpit','RoadView','Full Screen'];
export const DEFAULT_THEME = 'road-road-66';
/** Legacy Tie/X-wing-named Theme Lab ids → Galactic Enforcer / Trenchlight. */
export const RETIRED_THEME_IDS: Record<string, string> = {
  tie: 'galactic-enforcer',
  xwing: 'galactic-enforcer',
  'road-tie-fighter': 'road-trenchlight',
  // Pack-owned legacy ids (decoded at runtime; see packs/migrations.ts).
  ...PACK_THEME_MIGRATIONS,
};
export const themeForId = (id: string) => {
  const resolved = RETIRED_THEME_IDS[id] ?? id;
  return THEMES.find(t=>t.id===resolved) ?? THEMES.find(t=>t.id===DEFAULT_THEME)!;
};
