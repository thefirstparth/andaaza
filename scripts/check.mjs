// A quick health check of the data: reads all three sources once and prints what the page would show.
//   npm run check
import { consensus } from "../lib/consensus.js";
const t = Date.now(), d = await consensus();
console.log(`read in ${((Date.now() - t) / 1000).toFixed(1)}s`);
for (const s of d.sources) console.log(`  ${s.ok ? "ok  " : "DOWN"} ${s.name}${s.ok ? `: ${s.count} markets` : `: ${s.error}`}`);
console.log(`tide board ${d.board?.length || 0} · subjects ${d.topics.length} · currents ${d.movers.length} · where the money is ${d.world.length} · misc ${d.misc.length}`);
for (const t of d.topics) console.log(`  ${t.id.padEnd(9)} ${String(t.items.length).padStart(2)} markets${t.next?.length ? `, ${t.next.length} coming up` : ""}`);
if (!d.sources.some(s => s.ok)) process.exit(1);
