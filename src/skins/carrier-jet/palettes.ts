import type { CarrierJetVariant } from './model';

/** SVG palette per variant (concept boards A/B/C; graphics pairs measured ≥3:1 on their grounds). */
export interface CjPalette {
  sym: string; symText: string; ref: string; ground: string; boxBg: string; tapeBg: string; edge: string; fill: string; tick: string; tapeText: string;
  pointer: string; caret: string; hatch: string; litFill: string; litText: string; overFill: string; winBg: string; winEdge: string; winText: string; winRx: number;
  ghost: string; jetFill: string; jetStroke: string; wingFill: string; wingStroke: string; canopy: string; arc: string; arcText: string; text: string;
  onSpeed: string; idxOff: string; idxHigh: string; idxOn: string; idxLow: string; lensBg: string; datum: string; ball: string; ballEdge: string;
  abFill: string; abText: string; abLabel: string; glow: string;
}

export const PALETTES: Record<CarrierJetVariant, CjPalette> = {
  'carrier-jet': {
    sym: '#7ef7a1', symText: '#7ef7a1', ref: '#e2ffe8', ground: '#0b2213', boxBg: '#041009', tapeBg: '#041009', edge: '#4fcf75', fill: '#3dbe66', tick: '#7ef7a1', tapeText: '#7ef7a1',
    pointer: '#e2ffe8', caret: '#ffb54a', hatch: '#3c9a5a', litFill: '#7ef7a1', litText: '#03100a', overFill: '#ffb54a', winBg: '#041009', winEdge: '#45ad66', winText: '#6fe593', winRx: 2,
    ghost: '#2f7d49', jetFill: '#0b2615', jetStroke: '#7ef7a1', wingFill: '#1f6a3a', wingStroke: '#c4ffd4', canopy: '#03100a', arc: '#5fd685', arcText: '#7ef7a1', text: '#7ef7a1',
    onSpeed: '#ffb54a', idxOff: '#45ad66', idxHigh: '#7ef7a1', idxOn: '#ffb54a', idxLow: '#ff8a66', lensBg: '#03100a', datum: '#7ef7a1', ball: '#ffb54a', ballEdge: '#fff1cf',
    abFill: '#ffb54a', abText: '#1a0e00', abLabel: '#ffb54a', glow: '#7ef7a1',
  },
  tomcat: {
    sym: '#5dff9a', symText: '#5dff9a', ref: '#f4f7f5', ground: '#000000', boxBg: '#000', tapeBg: '#000', edge: '#5dff9a', fill: '#2fcf6e', tick: '#5dff9a', tapeText: '#d9e0dc',
    pointer: '#f4f7f5', caret: '#ffc23d', hatch: '#8a6a20', litFill: '#5dff9a', litText: '#000', overFill: '#ffc23d', winBg: '#000', winEdge: '#66706b', winText: '#a8b1ad', winRx: 13,
    ghost: '#4f7d62', jetFill: '#06140c', jetStroke: '#5dff9a', wingFill: '#5dff9a', wingStroke: '#5dff9a', canopy: '#000', arc: '#5dff9a', arcText: '#d9e0dc', text: '#d9e0dc',
    onSpeed: '#ffc23d', idxOff: '#66706b', idxHigh: '#5dff9a', idxOn: '#ffc23d', idxLow: '#ff7b6b', lensBg: '#000', datum: '#5dff9a', ball: '#ffc23d', ballEdge: '#fff',
    abFill: '#ffc23d', abText: '#000', abLabel: '#ffc23d', glow: '#5dff9a',
  },
  'swing-wing': {
    sym: '#9fcbff', symText: '#cfe3ff', ref: '#ffc35a', ground: '#132235', boxBg: '#0b1018', tapeBg: '#0b1018', edge: '#7fb6f5', fill: '#4ea3ff', tick: '#9fcbff', tapeText: '#dbe6f2',
    pointer: '#ffffff', caret: '#ffc35a', hatch: '#a67a2c', litFill: '#4ea3ff', litText: '#03080f', overFill: '#ffc35a', winBg: '#0b1018', winEdge: '#5f7a99', winText: '#aebdcc', winRx: 4,
    ghost: '#4b6a8f', jetFill: '#243243', jetStroke: '#d5dee8', wingFill: '#3b4d63', wingStroke: '#ffc35a', canopy: '#0b1018', arc: '#4ea3ff', arcText: '#cfe3ff', text: '#dbe6f2',
    onSpeed: '#ffc35a', idxOff: '#5f7a99', idxHigh: '#5be38f', idxOn: '#ffc35a', idxLow: '#ff7070', lensBg: '#05080d', datum: '#5be38f', ball: '#ffc35a', ballEdge: '#fff',
    abFill: '#ffc35a', abText: '#120a00', abLabel: '#ffc35a', glow: '',
  },
};
