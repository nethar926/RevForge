/**
 * Car-test diagnostics line (Options): the audio output's channel count from Dan's getOutputChannels() (75474bd:
 * AudioContext destination.maxChannelCount, null until audio starts). Read through an optional method so this
 * compiles and shows '—' on engines / branches without it.
 */
export interface AudioChannelsSource { getOutputChannels?: () => number | null }
export function readOutputChannels(audio: object): number | null {
  try {
    const n = (audio as AudioChannelsSource).getOutputChannels?.();
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  } catch {
    return null;
  }
}
export function audioChannelsLine(n: number | null): { text: string; aria: string } {
  return n == null
    ? { text: 'AUDIO CHANNELS: —', aria: 'Audio output channels, not available' }
    : { text: `AUDIO CHANNELS: ${n}`, aria: `Audio output channels, ${n}` };
}
