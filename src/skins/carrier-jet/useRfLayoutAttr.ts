import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Frontend's layout picker value (`data-rf-layout` on the nearest ancestor: board | window | portrait | phone-landscape),
 * read from the DOM the same way CarrierJetHud reads it, so a host that already sets the attribute needs no new prop.
 * null until mounted / when no ancestor carries it (server render, previews) → callers fall back to 'full'.
 */
export function useRfLayoutAttr(ref: RefObject<HTMLElement | null>, enabled = true): string | null {
  const [layout, setLayout] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof MutationObserver === 'undefined') return;
    const check = () => setLayout(el.parentElement?.closest('[data-rf-layout]')?.getAttribute('data-rf-layout') ?? null);
    check();
    const mo = new MutationObserver(check);
    for (let a = el.parentElement; a; a = a.parentElement) mo.observe(a, { attributes: true, attributeFilter: ['data-rf-layout'] });
    return () => mo.disconnect();
  }, [ref, enabled]);
  return layout;
}
