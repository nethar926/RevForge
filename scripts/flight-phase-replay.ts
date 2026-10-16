// Print a Carrier Jet flight-phase timeline for a CSV of t,speedMps (seconds, m/s).
//   node scripts/flight-phase-replay.ts trace.csv [--unarmed] [--callouts]
import { readFileSync } from 'node:fs';
import { formatTimeline, parseTraceCsv, replay } from '../tests/flightReplay.ts';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node scripts/flight-phase-replay.ts <trace.csv> [--unarmed] [--callouts]');
  process.exit(1);
}
const res = replay(parseTraceCsv(readFileSync(file, 'utf8')), {
  abArmed: !args.includes('--unarmed'),
  config: { highSpeedCallouts: args.includes('--callouts') },
});
console.log(formatTimeline(res));
console.log(`\nphases: ${res.phases.map((p) => `${p.phase}@${p.t}s`).join(' → ')}`);
console.log(`events: ${res.events.map((e) => `${e.type}@${e.t}s`).join(', ') || '(none)'}`);
