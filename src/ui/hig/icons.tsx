/**
 * Interface glyphs from Lucide (https://lucide.dev), ISC License,
 * Copyright (c) 2026 Lucide Icons and Contributors; Feather-derived icons
 * (x, check, chevron-*, minus, plus, power) MIT, Copyright (c) 2013-present Cole Bemis.
 * Full text: public/licenses/lucide-LICENSE.txt. Paths copied verbatim from
 * lucide-static@1.50.0 so no runtime dependency is added. Not SF Symbols.
 */
import type { SVGProps } from 'react';

const PATHS = {
  'sliders-horizontal': ['M10 5H3', 'M12 19H3', 'M14 3v4', 'M16 17v4', 'M21 12h-9', 'M21 19h-5', 'M21 5h-7', 'M8 10v4', 'M8 12H3'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  'chevron-left': ['m15 18-6-6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevron-down': ['m6 9 6 6 6-6'],
  menu: ['M4 5h16', 'M4 12h16', 'M4 19h16'],
  'volume-2': ['M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z', 'M16 9a5 5 0 0 1 0 6', 'M19.364 18.364a9 9 0 0 0 0-12.728'],
  'volume-x': ['M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z', 'm16.5 14.5 5-5', 'm16.5 9.5 5 5'],
  check: ['M20 6 9 17l-5-5'],
  minus: ['M5 12h14'],
  plus: ['M5 12h14', 'M12 5v14'],
  power: ['M12 2v10', 'M18.4 6.6a9 9 0 1 1-12.77.04'],
} as const;

export type IconName = keyof typeof PATHS;

/** Sized in em so icons track Text size (HIG Typography: scale meaningful icons with text). */
export function Icon({ name, size = '1.25em', strokeWidth = 1.75, ...rest }: { name: IconName; size?: number | string; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="hig-icon"
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
