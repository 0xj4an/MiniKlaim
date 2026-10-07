#!/usr/bin/env node
/**
 * Analyze relayer costs and sponsored transactions
 */
import { createPublicClient, http, formatEther } from "viem";
import { celo } from "viem/chains";

const RELAYER = "0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83" as const;
const HEXES = "0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B" as const;

async function main() {
  console.log("=== ANÁLISIS DE COSTOS DEL RELAYER ===\n");

  const client = createPublicClient({
    chain: celo,
    transport: http("https://forno.celo.org"),
  });

  // Balance actual
  const balance = await client.getBalance({ address: RELAYER });
  const balanceCelo = parseFloat(formatEther(balance));

  console.log("💰 BALANCE ACTUAL:");
  console.log(`  Relayer: ${balanceCelo.toFixed(6)} CELO`);
  console.log(`  Status: ${balanceCelo < 1 ? "🔴 CRÍTICO" : balanceCelo < 5 ? "⚠️  BAJO" : "✅ OK"}\n`);

  // Obtener el bloque actual
  const currentBlock = await client.getBlockNumber();
  console.log(`📦 Bloque actual: ${currentBlock}\n`);

  // Estimar bloques de hoy (12 segundos por bloque, ~7200 bloques/día)
  const blocksPerDay = BigInt(7200);
  const startBlock = currentBlock - blocksPerDay;

  console.log("🔍 MODELO DE COSTOS:\n");
  console.log("1️⃣  USUARIOS PAGAN (mayoría):");
  console.log("    Gas en USDT/USDC/USDm vía Celo CIP-64");
  console.log("    Costo para ti: $0\n");

  console.log("2️⃣  RELAYER SPONSOREA (fallback):");
  console.log("    Cuando usuario no tiene fondos o rechaza");
  console.log("    Costo estimado: 0.01-0.05 CELO por tx\n");

  // Obtener transacciones del contrato Hexes para ver cuántas fueron del relayer
  console.log(`📊 Analizando transacciones desde bloque ${startBlock}...`);
  console.log("   (esto puede tardar un poco)\n");

  try {
    const logs = await client.getLogs({
      address: HEXES,
      fromBlock: startBlock,
      toBlock: currentBlock,
    });

    console.log(`📈 ACTIVIDAD HOY:`);
    console.log(`  Eventos en contrato: ${logs.length}`);

    // Nota: Para análisis más detallado necesitaríamos los topics específicos
    // de los eventos HexCaptured, pero esto da una idea de la actividad

    console.log(`\n💸 ESTIMACIÓN DE GASTO:`);
    console.log(`  Si el balance era ~1 CELO ayer:`);
    console.log(`  Gastado hoy: ~${(1 - balanceCelo).toFixed(4)} CELO`);
    console.log(`  Proyección mensual: ~${((1 - balanceCelo) * 30).toFixed(2)} CELO/mes`);
    console.log(`  En USD (~$1/CELO): ~$${((1 - balanceCelo) * 30).toFixed(2)}/mes`);

    console.log(`\n⚠️  RECOMENDACIÓN:`);
    if (balanceCelo < 1) {
      console.log(`  🔴 URGENTE: Transferir 20 CELO al relayer`);
    } else if (balanceCelo < 5) {
      console.log(`  ⚠️  Transferir 10-15 CELO pronto`);
    } else {
      console.log(`  ✅ Balance suficiente por ahora`);
    }

    console.log(`\n🔗 Ver transacciones:`);
    console.log(`   https://celoscan.io/address/${RELAYER}`);
  } catch (error) {
    console.error("Error al consultar logs:", error);
  }
}

main().catch(console.error);
