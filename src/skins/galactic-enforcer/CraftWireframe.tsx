import { CRAFT, type CraftId } from './craft';

/** Inline SVG group for embedding inside another <svg>. */
export function CraftWireframe({ id, className = '' }: { id: CraftId; className?: string }) {
  const c = CRAFT[id];
  const Art = c.art;
  return (
    <g className={`ge-craft ${className}`} data-craft={id} style={{ transformOrigin: `${c.cx}px ${c.cy}px` }}>
      <Art />
    </g>
  );
}
