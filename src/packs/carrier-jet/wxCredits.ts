/**
 * CJ (i) map-credit popover: the weather / radar credit rows under the map credit (pure, node-testable).
 * Open-Meteo (CC BY 4.0) asks for a link to open-meteo.com and to the licence; RainViewer asks for a link to
 * rainviewer.com. Each link is its own full-width row, >= 44px tall (the whole row is the tap target, Apple HIG 44pt),
 * opening in a new tab. NWS (US government data, courtesy credit) stays a plain row.
 */
import { WX_CREDIT, WX_CREDIT_URL, type WxSource } from './wxView.ts';
import { WX_RADAR_CREDIT, WX_RADAR_URL } from './wxRadar.ts';

export const WX_LICENSE_TEXT = 'CC BY 4.0';
export const WX_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

export interface WxCreditRow {
  id: 'nws' | 'om' | 'om-license' | 'radar';
  text: string;
  /** https link (a >= 44px row, new tab); absent = plain text row */
  href?: string;
}
/** Rows for the weather source on screen (null = no OAT value shown) and the radar overlay (on = credit). */
export function wxCreditRows(source: WxSource | null, radar: boolean): WxCreditRow[] {
  const rows: WxCreditRow[] = [];
  if (source === 'nws') rows.push({ id: 'nws', text: WX_CREDIT.nws });
  if (source === 'om') rows.push({ id: 'om', text: WX_CREDIT.om, href: WX_CREDIT_URL }, { id: 'om-license', text: WX_LICENSE_TEXT, href: WX_LICENSE_URL });
  if (radar) rows.push({ id: 'radar', text: WX_RADAR_CREDIT, href: WX_RADAR_URL });
  return rows;
}
