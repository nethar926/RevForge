/**
 * Carrier Jet's CONFIG table entry (framework). The shared system (../configTable.ts) does the rest; a theme only
 * supplies its role tab, its looks and extras. Look names come from the skin's LOOK_LABELS (MATRIX / VECTOR / HOLO,
 * Meghan; exported via skins/carrier-jet index → model). Internal ids carrier-jet / tomcat / swing-wing stay (saved
 * choice, preview URL, deep links). Imported from model.ts directly (the same export) so this stays node-testable.
 */
import { buildConfig, type PackConfigSpec } from '../configTable.ts';
import { CARRIER_JET_VARIANTS, LOOK_LABELS } from '../../skins/carrier-jet/model.ts';

export const CJ_CONFIG_SPEC: PackConfigSpec = {
  role: 'PILOT',
  roleShort: 'PLT',
  looks: CARRIER_JET_VARIANTS.map((v) => ({ id: v.id, label: LOOK_LABELS[v.id] })),
};

export const CJ_CONFIG = buildConfig(CJ_CONFIG_SPEC);
