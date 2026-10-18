/**
 * Display copy for the RevForge scene presets: the ONE place their names and taglines live.
 *
 * PLACEHOLDERS (Oct 18 2026). The dribe-derived scene names and mood blurbs were retired
 * (product-research/dribe-derivation-audit-2026-10-18.md, P1/P2). Until Wilson approves Lana's
 * rename sheet (product-research/dribe-rename-sheet-2026-10-18.md), every re-keyed preset
 * shows a neutral "Pack NN" name and an empty tagline. The keys and order below are the sheet's
 * rows 1-11, so the approved copy drops in one-to-one: replace each `name` with the sheet's
 * "New name" and each `tagline` with its "New tagline", nothing else.
 *
 * The same `name` is used for the preset (revforge-<id> engine patch) and for its RoadView
 * theme (road-<id>, themes/catalog.ts), so one edit renames both.
 *
 * Rules for any copy that lands here: no dribe names or blurbs, no trademarks, no real car models.
 */
export interface SceneLabel {
  name: string;
  tagline: string;
}

/** Re-keyed presets (sheet rows 1-11). PLACEHOLDER copy. */
export const SCENE_LABELS = {
  'copper-mile': { name: 'Pack 01', tagline: '' },
  'ember-dusk': { name: 'Pack 02', tagline: '' },
  'violet-grid': { name: 'Pack 03', tagline: '' },
  'azure-bend': { name: 'Pack 04', tagline: '' },
  'pink-current': { name: 'Pack 05', tagline: '' },
  'silver-run': { name: 'Pack 06', tagline: '' },
  lightline: { name: 'Pack 07', tagline: '' },
  sandwake: { name: 'Pack 08', tagline: '' },
  frostpass: { name: 'Pack 09', tagline: '' },
  'deep-transit': { name: 'Pack 10', tagline: '' },
  'blossom-run': { name: 'Pack 11', tagline: '' },
} as const satisfies Record<string, SceneLabel>;

export type RenamedSceneId = keyof typeof SCENE_LABELS;

/**
 * Presets outside the dribe rename (unchanged copy, moved here from revforge-packs.json so every
 * scene label lives in one file). The sheet's "Not dribe" section suggests new copy for these;
 * that is Wilson's call and a separate change.
 */
export const OTHER_SCENE_LABELS = {
  trenchlight: { name: 'Ion Run', tagline: 'Twin-ion scream. Trenchlight corridor.' },
  'light-grid': { name: 'Lightbike', tagline: 'Electric harmonic drive, luminous acceleration and a light-grid horizon.' },
} as const satisfies Record<string, SceneLabel>;

const ALL: Record<string, SceneLabel> = { ...SCENE_LABELS, ...OTHER_SCENE_LABELS };

/** Label for a scene id; unknown ids get a neutral fallback (never an old name). */
export const sceneLabel = (id: string): SceneLabel => ALL[id] ?? { name: 'RevForge pack', tagline: '' };

/**
 * CustomizePage accent colour (id 'neon' stays internal). PLACEHOLDER label: the rename sheet
 * row 13 proposes "Violet" (id `violet`); renaming the id needs a prefs migration, so it is not done here.
 */
export const NEON_ACCENT_LABEL = 'Magenta Pulse';
