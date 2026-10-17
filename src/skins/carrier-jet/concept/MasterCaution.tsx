/**
 * MASTER CAUTION push button (mock; replaces "Caution reset" / CAUT RST). Square matte-black cap with an engraved
 * two-line legend. Dark at rest; lit steady orange (no flashing) while any caution is present; a press resets it
 * (light out). 64×64 (≥ 44). VoiceOver: "Master caution, lit, press to reset" / "Master caution, no cautions".
 */
export function MasterCaution({ lit, onPress, step }: { lit: boolean; onPress?: () => void; step?: string }) {
  return (
    <button type="button" className="mcb" data-lit={lit || undefined} aria-label={lit ? `Master caution, lit, press to reset${step ? `, step ${step.replace(/^(\d+)([a-z])$/, '$1 $2')}` : ''}` : 'Master caution, no cautions'} onClick={onPress}>
      <span className="mcb-face" aria-hidden="true">
        <span>MASTER</span>
        <span>CAUTION</span>
      </span>
      {step && <span className="mcb-step" aria-hidden="true">{step}</span>}
    </button>
  );
}
