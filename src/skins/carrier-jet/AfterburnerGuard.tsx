import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import './carrier-jet.css';
import './switches.css';
import { cjGuardVariantFor, guardView, type CjGuardVariant } from './switches';
import { useRfLayoutAttr } from './useRfLayoutAttr';

export interface CarrierJetAfterburnerGuardProps {
  /** ARM key lit (true) or dim with the SAFE legend (false). */
  armed: boolean;
  /** Called when ARM is tapped (only reachable while the guard is open). */
  onArm: () => void;
  /** Guard flipped up, ARM reachable. */
  guardOpen: boolean;
  /** Called when the guard is tapped (open ⇄ closed). Escape on ARM also calls it to close. */
  onGuardToggle: () => void;
  /**
   * 'full' = concept-sheet art · 'compact' = one strip (AFTERBURNER cap · guard well · plate, 60px tall); inside
   * CarrierJetHud's `flightSlot` it stacks to the slot width. Default 'auto': compact in the phone layouts
   * (nearest `data-rf-layout` = portrait | phone-landscape) or inside the HUD slot, else full.
   */
  variant?: CjGuardVariant | 'auto';
}

/**
 * Carrier Jet afterburner guard, option B: striped red/yellow frame with a smoked window, so the lit ARM key
 * shows through while closed. Tapping the guard flips it open (transform/opacity only, off under Reduce Motion).
 * Stores nothing: `armed` and `guardOpen` come from the host. Taps only, no drag.
 */
export function CarrierJetAfterburnerGuard({ armed, onArm, guardOpen, onGuardToggle, variant = 'auto' }: CarrierJetAfterburnerGuardProps) {
  const v = guardView(armed, guardOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const rf = useRfLayoutAttr(rootRef, variant === 'auto');
  const [inSlot, setInSlot] = useState(false);
  useLayoutEffect(() => {
    if (variant === 'auto') setInSlot(!!rootRef.current?.closest('.cj-abslot'));
  }, [variant]);
  const look: CjGuardVariant = variant === 'auto' ? (inSlot ? 'compact' : cjGuardVariantFor(rf)) : variant;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const armId = `cjg-arm-${uid}`;
  const statusId = `cjg-st-${uid}`;
  const guardRef = useRef<HTMLButtonElement>(null);
  const armRef = useRef<HTMLButtonElement>(null);
  const prevOpen = useRef(guardOpen);
  const escClose = useRef(false);

  // Focus follows the flip when it came from the keyboard/tap on our own controls: open → ARM, close → guard.
  useEffect(() => {
    if (prevOpen.current === guardOpen) return;
    prevOpen.current = guardOpen;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (guardOpen && active === guardRef.current) armRef.current?.focus();
    else if (!guardOpen && (escClose.current || active === armRef.current)) guardRef.current?.focus();
    escClose.current = false;
  }, [guardOpen]);

  const onArmKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      escClose.current = true;
      onGuardToggle();
    }
  };

  return (
    <div ref={rootRef} className="cjg" data-open={guardOpen} data-armed={armed} data-cjg-variant={look === 'full' ? undefined : look}>
      <div className="cjg-cap" aria-hidden="true">AFTERBURNER</div>
      <div className="cjg-well">
        <div className="cjg-arm-slot" id={armId} inert={v.arm.inert}>
          <button
            ref={armRef}
            type="button"
            className="cjg-arm"
            role={v.arm.role}
            aria-checked={v.arm['aria-checked']}
            aria-label={v.arm['aria-label']}
            tabIndex={v.arm.tabIndex}
            onClick={onArm}
            onKeyDown={onArmKey}
          >
            <span className="cjg-arm-t" aria-hidden="true">ARM</span>
            <span className="cjg-arm-s" aria-hidden="true">{v.keyLegend}</span>
          </button>
        </div>
        <button
          ref={guardRef}
          type="button"
          className="cjg-guard"
          aria-expanded={v.guard['aria-expanded']}
          aria-label={v.guard['aria-label']}
          aria-controls={armId}
          aria-describedby={statusId}
          onClick={onGuardToggle}
        >
          <span className="cjg-lid" aria-hidden="true">
            <span className="cjg-frame" />
            <span className="cjg-win" />
            <span className="cjg-tab">GUARD ▲</span>
          </span>
          <span className="cjg-strip" aria-hidden="true">
            <span className="cjg-tab">GUARD ▼</span>
          </span>
        </button>
      </div>
      <div className="cjg-plate" id={statusId} data-armed={armed}>
        <span aria-hidden="true">{v.plate}</span>
        <span className="cj-sr">{v.status}</span>
      </div>
    </div>
  );
}
