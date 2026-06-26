// Tamper demo: make the issuer actually insolvent and show the system catches
// it two independent ways — the proof can't be generated, AND the on-chain
// contract rejects a stale proof because it binds to the LIVE reserve read.
//
//   bun run scripts/tamper.ts          # drain reserves below liabilities
//   bun run scripts/tamper.ts restore  # mint reserves back to solvent
//
// All transfers/mints are real testnet transactions.
import { $ } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const r = (p: string) => readFileSync(join(ROOT, p), "utf8").trim();

const cid = r("sdk/build/contract_id.txt");
const sac = r("sdk/build/sac_id.txt");
const issuer = r("sdk/build/issuer.txt");
const reserve = r("sdk/build/reserve.txt");
const ledger = JSON.parse(readFileSync(join(ROOT, "circuits/build/ledger.json"), "utf8"));

const reservesNow = async (): Promise<bigint> => {
  const out = await $`stellar contract invoke --id ${cid} --source issuer --network testnet -- reserves`.text();
  return BigInt(out.replace(/[^0-9]/g, ""));
};

const mode = process.argv[2] ?? "drain";

if (mode === "restore") {
  const target = BigInt(ledger.total_reserves);
  const cur = await reservesNow();
  const back = target - cur;
  if (back > 0n) {
    console.log(`minting ${back} RSV back to restore solvency`);
    await $`stellar contract invoke --id ${sac} --source issuer --network testnet -- mint --to ${reserve} --amount ${back}`;
  }
  console.log(`reserves restored to ${await reservesNow()}`);
} else {
  const liabilities = BigInt(ledger.total_liabilities);
  const cur = await reservesNow();
  // leave reserves at ~half the liabilities -> clearly insolvent
  const drain = cur - liabilities / 2n;
  console.log(`reserves before: ${cur}  (liabilities ${liabilities})`);
  console.log(`draining ${drain} RSV reserve -> issuer (real tx)`);
  await $`stellar contract invoke --id ${sac} --source reserve --network testnet -- transfer --from ${reserve} --to ${issuer} --amount ${drain}`;
  const after = await reservesNow();
  console.log(`reserves after:  ${after}  -> INSOLVENT: ${after < liabilities}`);
  console.log("");
  console.log("now: (1) `bun run scripts/prove.ts` fails — cannot prove solvency while insolvent");
  console.log("     (2) submitting any prior proof to `attest` reverts with InvalidProof (#5)");
  console.log("         because the contract binds total_reserves to this LIVE low balance");
}
