// Generates a solvency proof bound to the LIVE on-chain reserve balance.
//
//   bun run scripts/prove.ts
//
// This is the real issuer flow: read R from the contract, then prove
// Σ liabilities ≤ R for the seeded ledger. If the issuer is insolvent the
// circuit assertion fails here and NO proof is produced.
import { $ } from "bun";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const BUILD = join(ROOT, "circuits", "build");
const cid = readFileSync(join(ROOT, "sdk/build/contract_id.txt"), "utf8").trim();

// 1. Read live reserves from the contract.
const out = await $`stellar contract invoke --id ${cid} --source issuer --network testnet -- reserves`.text();
const R = out.replace(/[^0-9]/g, "");
console.log(`live on-chain reserves R = ${R}`);

// 2. Bind the proof to R (same ledger leaves -> same liabilities_root).
const input = JSON.parse(readFileSync(join(BUILD, "input_solvent.json"), "utf8"));
input.total_reserves = R;
writeFileSync(join(BUILD, "input.json"), JSON.stringify(input)); // bun writes no BOM

// 3. Prove + verify (fails here if insolvent).
await $`snarkjs wtns calculate ${join(BUILD, "solvency_js/solvency.wasm")} ${join(BUILD, "input.json")} ${join(BUILD, "witness.wtns")}`;
await $`snarkjs groth16 prove ${join(BUILD, "solvency_final.zkey")} ${join(BUILD, "witness.wtns")} ${join(BUILD, "proof.json")} ${join(BUILD, "public.json")}`;
await $`snarkjs groth16 verify ${join(BUILD, "verification_key.json")} ${join(BUILD, "public.json")} ${join(BUILD, "proof.json")}`;

// 4. Convert to Soroban byte layout for `attest`.
await $`bun run ${join(ROOT, "sdk/convert.ts")}`;
console.log("proof bound to live reserves and converted -> ready for `attest`");
