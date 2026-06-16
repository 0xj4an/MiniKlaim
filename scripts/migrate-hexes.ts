import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { drizzle } from "drizzle-orm/postgres-js";
import { inArray } from "drizzle-orm";
import postgres from "postgres";
import {
  type Address,
  type Hex,
  createWalletClient,
  createPublicClient,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { hexes } from "../lib/db/schema";

/**
 * One-time migration: re-mint every hex in the DB (the canonical ownership list)
 * into the NEW upgradeable Hexes proxy via `adminImport`.
 *
 * Run AFTER deploying the new proxy and setting NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS
 * to the proxy address:
 *   tsx scripts/migrate-hexes.ts
 *
 * Requires: DATABASE_URL, NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS (new proxy),
 *           SERVER_SIGNER_PRIVATE_KEY (holds DEFAULT_ADMIN_ROLE on the new proxy).
 */

const BATCH_SIZE = 150;

const ADMIN_IMPORT_ABI = [
  {
    type: "function",
    name: "adminImport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "players", type: "address[]" },
      { name: "h3Ids", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

function h3ToTokenId(h3: string): bigint {
  return BigInt(`0x${h3}`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const contract = process.env.NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS as Address;
  const pk = process.env.SERVER_SIGNER_PRIVATE_KEY as Hex;

  if (!connectionString) throw new Error("DATABASE_URL not set");
  if (!contract || contract.length !== 42) {
    throw new Error("NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS not set (new proxy)");
  }
  if (!pk || pk.length !== 66) {
    throw new Error("SERVER_SIGNER_PRIVATE_KEY not set");
  }

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client);

  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: celo, transport: http() });
  const publicClient = createPublicClient({ chain: celo, transport: http() });

  const rows = await db
    .select({ h3Id: hexes.h3Id, owner: hexes.ownerAddress })
    .from(hexes);
  console.log(`Migrating ${rows.length} hexes to ${contract} ...`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const players = batch.map((r) => r.owner as Address);
    const tokenIds = batch.map((r) => h3ToTokenId(r.h3Id));

    const txHash = await wallet.writeContract({
      address: contract,
      abi: ADMIN_IMPORT_ABI,
      functionName: "adminImport",
      args: [players, tokenIds],
      chain: celo,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    await db
      .update(hexes)
      .set({ mintedAt: new Date(), mintTxHash: txHash })
      .where(
        inArray(
          hexes.h3Id,
          batch.map((r) => r.h3Id),
        ),
      );

    console.log(
      `  batch ${i / BATCH_SIZE + 1}: ${batch.length} hexes -> ${txHash}`,
    );
  }

  console.log("Migration complete.");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
