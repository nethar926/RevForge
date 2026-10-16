export const JET_GEAR: Readonly<{
  up: { travel: number; minTravel: number; tail: number };
  down: { travel: number; minTravel: number; tail: number };
  compressed: number;
  stagger: readonly number[];
  pan: readonly number[];
}>;
export class GearSequence {
  constructor(voice: unknown, dir: 'up' | 'down', t0: number, opts?: { compressed?: boolean; level?: number });
  readonly dir: 'up' | 'down';
  readonly t0: number;
  readonly minT: number;
  readonly autoT: number;
  readonly endT: number;
  readonly locked: boolean;
  readonly lockAt: number;
  /** Lock reported at t: catch up (never before minTravel); returns false for a late / repeated report. */
  lock(t: number): boolean;
  abort(t: number): void;
  dispose(): void;
}
