/** Pure HUD model helpers (testable without React). */
export type Stage = 'SEARCHING' | 'ACQUIRING' | 'TARGET LOCK' | 'FIRING SOLUTION';
const STAGE_FROM_PROP: Record<string, Stage> = {
  none: 'SEARCHING',
  identified: 'ACQUIRING',
  lock: 'TARGET LOCK',
  kill: 'FIRING SOLUTION',
};

export function lockStageFor(rev: number, lockStage?: string): Stage {
  if (lockStage) return STAGE_FROM_PROP[lockStage] ?? 'SEARCHING';
  return rev >= 0.86 ? 'FIRING SOLUTION' : rev >= 0.7 ? 'TARGET LOCK' : rev >= 0.5 ? 'ACQUIRING' : 'SEARCHING';
}

