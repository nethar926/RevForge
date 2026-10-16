/**
 * CJ v2 CONFIG open state (framework; pure store). The NAV row's OPTIONS switch opens it; the host layer
 * (mounts/CjV2Layer) renders it. Opened while no layer is mounted (another route) → pending until Drive mounts one.
 */
import type { PageId } from '../configTable.ts';

export interface CjConfigState { open: boolean; page: PageId; sub: number }
let st: CjConfigState = { open: false, page: 'home', sub: 0 };
let hosts = 0;
const subs = new Set<() => void>();
const emit = () => {
  for (const f of [...subs]) f();
};
export const getCjConfig = () => st;
export const subscribeCjConfig = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
export function setCjConfig(next: Partial<CjConfigState>) {
  st = { ...st, ...next };
  emit();
}
export const openCjConfig = () => setCjConfig({ open: true, page: 'home', sub: 0 });
export const closeCjConfig = () => setCjConfig({ open: false, page: 'home', sub: 0 });
export const toggleCjConfig = () => (st.open ? closeCjConfig() : openCjConfig());
/** The layer registers while mounted; the NAV row asks whether CONFIG can show here. */
export function registerCjConfigHost(): () => void {
  hosts++;
  emit();
  return () => {
    hosts--;
    emit();
  };
}
export const cjConfigHosted = () => hosts > 0;
