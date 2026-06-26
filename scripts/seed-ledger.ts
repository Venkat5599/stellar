// Seeds a realistic internal customer ledger and computes the Poseidon
// Merkle-sum root off-chain (same BN254 Poseidon as the circuit), then writes
// the circuit input. The numbers are ours; the cryptography matches the circuit.
//
//   bun run scripts/seed-ledger.ts [levels] [reserveBufferPct]
//
// Outputs:
//   circuits/build/input.json  -> witness + public inputs for snarkjs
//   circuits/build/ledger.json -> full leaf set (for customer inclusion proofs)
import { buildPoseidon } from "circomlibjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LEVELS = Number(process.argv[2] ?? 3);
const BUFFER_PCT = Number(process.argv[3] ?? 10); // reserves = liabilities * (1 + pct/100)
const N = 1 << LEVELS;
const BUILD = join(import.meta.dir, "..", "circuits", "build");

function randBalance(): bigint {
  // realistic spread: most small, a few large; all < 2^64
  const r = Math.random();
  if (r < 0.7) return BigInt(Math.floor(Math.random() * 5_000_00)); // < $5k in cents
  if (r < 0.95) return BigInt(Math.floor(Math.random() * 100_000_00));
  return BigInt(Math.floor(Math.random() * 5_000_000_00));
}

const poseidon = await buildPoseidon();
const F = poseidon.F;
const toBig = (x: any): bigint => F.toObject(x);

// 1. Build leaves
const ids: bigint[] = [];
const balances: bigint[] = [];
const salts: bigint[] = [];
for (let i = 0; i < N; i++) {
  ids.push(BigInt(1000 + i));
  balances.push(randBalance());
  // deterministic-but-unguessable salt for the demo
  salts.push(BigInt("0x" + crypto.randomUUID().replace(/-/g, "")));
}

// 2. Merkle-sum tree (heap layout, TOT = 2N-1)
const TOT = 2 * N - 1;
const h: bigint[] = new Array(TOT).fill(0n);
const s: bigint[] = new Array(TOT).fill(0n);
for (let i = 0; i < N; i++) {
  h[N - 1 + i] = toBig(poseidon([ids[i], balances[i], salts[i]]));
  s[N - 1 + i] = balances[i];
}
for (let i = N - 2; i >= 0; i--) {
  const sum = s[2 * i + 1] + s[2 * i + 2];
  h[i] = toBig(poseidon([h[2 * i + 1], h[2 * i + 2], sum]));
  s[i] = sum;
}

const liabilities_root = h[0];
const total_liabilities = s[0];
const total_reserves =
  total_liabilities + (total_liabilities * BigInt(BUFFER_PCT)) / 100n;

// 3. Write artifacts
mkdirSync(BUILD, { recursive: true });
const input = {
  ids: ids.map(String),
  balances: balances.map(String),
  salts: salts.map(String),
  liabilities_root: String(liabilities_root),
  total_reserves: String(total_reserves),
};
writeFileSync(join(BUILD, "input.json"), JSON.stringify(input, null, 2));

const ledger = {
  levels: LEVELS,
  leaves: ids.map((id, i) => ({
    id: String(id),
    balance: String(balances[i]),
    salt: String(salts[i]),
    leafHash: String(h[N - 1 + i]),
  })),
  liabilities_root: String(liabilities_root),
  total_liabilities: String(total_liabilities),
  total_reserves: String(total_reserves),
};
writeFileSync(join(BUILD, "ledger.json"), JSON.stringify(ledger, null, 2));

console.log(`seeded N=${N} (levels=${LEVELS})`);
console.log(`  total_liabilities = ${total_liabilities}`);
console.log(`  total_reserves    = ${total_reserves} (+${BUFFER_PCT}%)`);
console.log(`  liabilities_root  = ${liabilities_root}`);
console.log(`  -> ${join(BUILD, "input.json")}`);
console.log(`  -> ${join(BUILD, "ledger.json")}`);
