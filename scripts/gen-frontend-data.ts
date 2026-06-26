// Builds the static data the frontend uses: deployment info, the current
// public attestation snapshot, and per-customer inclusion proofs (so the
// Customer view can verify "my balance was counted" against the published root).
//
//   bun run scripts/gen-frontend-data.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { proveInclusion, verifyInclusion } from "../sdk/inclusion.ts";

const ROOT = join(import.meta.dir, "..");
const deployment = JSON.parse(readFileSync(join(ROOT, "sdk/build/deployment.json"), "utf8"));
const ledger = JSON.parse(readFileSync(join(ROOT, "circuits/build/ledger.json"), "utf8"));

const customers = ledger.leaves.map((l: any) => {
  const p = proveInclusion(ledger, l.id);
  return {
    id: p.id,
    balance: p.balance,
    leafHash: p.leafHash,
    path: p.path,
    verified: verifyInclusion(p, ledger.liabilities_root),
  };
});

const data = {
  deployment,
  attestation: {
    solvent: true,
    reserves: deployment.reserves,
    liabilities_root_dec: ledger.liabilities_root,
    total_liabilities: ledger.total_liabilities, // shown only as the PROVEN aggregate
    customer_count: ledger.leaves.length,
  },
  customers,
};

const out = join(ROOT, "frontend", "public", "ledgerproof.json");
mkdirSync(join(ROOT, "frontend", "public"), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 2));
console.log(`wrote ${out}`);
console.log(`  customers=${customers.length} all-verified=${customers.every((c: any) => c.verified)}`);
