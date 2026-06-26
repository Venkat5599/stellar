// Issues a testnet reserve asset (SAC) and funds the reserve account with the
// EXACT total_reserves the proof is bound to — all real testnet transactions.
//
//   bun run scripts/fund-reserves.ts
//
// Reads circuits/build/ledger.json for the target reserve figure and
// sdk/build/{issuer,reserve,sac_id}.txt for the already-created identities.
// Mints the exact i128 so the contract's on-chain read equals the proof's
// total_reserves public input.
import { $ } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const r = (p: string) => readFileSync(join(ROOT, p), "utf8").trim();

const sac = r("sdk/build/sac_id.txt");
const reserve = r("sdk/build/reserve.txt");
const ledger = JSON.parse(readFileSync(join(ROOT, "circuits/build/ledger.json"), "utf8"));
const amount = String(ledger.total_reserves);

console.log(`minting ${amount} RSV to reserve ${reserve} via SAC ${sac}`);
// mint requires asset-issuer (admin) auth -> --source issuer
await $`stellar contract invoke --id ${sac} --source issuer --network testnet -- mint --to ${reserve} --amount ${amount}`;
console.log("reserves funded. verify with: stellar contract invoke --id <CONTRACT> -- reserves");
