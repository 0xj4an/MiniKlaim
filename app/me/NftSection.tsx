"use client";

import { useLocale } from "@/lib/i18n";
import { useMintTokens } from "@/lib/wallet/useMintTokens";

/**
 * Runs settle on-chain as records in one approval (Hexes v2). Here the player
 * can turn their recorded blocks into NFTs, paying the fee themselves. Hidden
 * until the chain's Hexes contract records.
 *
 * MiniPay refused `mintTokens` with "Permission denied" whatever the batch
 * size (all 37 attempts from 14 players on 22 Oct 2026, 1 to 700 blocks),
 * while `claimRun` on the same contract went through, so the button was
 * replaced by a note there. MiniPay allowlisted the function on 28 Oct and
 * the note is gone: every wallet gets the button again. Nothing had exercised
 * the allowlist while the note was up, so the first real mint is the proof —
 * watch `nft_mint_confirmed` against `nft_mint_failed`.
 */
export function NftSection({ address }: { address: `0x${string}` | null }) {
  const { t } = useLocale();
  const { status, state, mint, lastMinted } = useMintTokens(address);
  if (!address || !status?.enabled) return null;
  if (status.recorded === 0 && status.tokens === 0) return null;

  const busy =
    state === "fetching-voucher" || state === "sending" || state === "confirming";

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm">
      <p className="text-center text-xs font-semibold text-zinc-800">
        {t("me.nfts.header")}
      </p>
      <p className="text-center text-xs text-zinc-600">
        {t("me.nfts.summary")
          .replace("{recorded}", status.recorded.toLocaleString())
          .replace("{tokens}", status.tokens.toLocaleString())}
      </p>

      {status.nextBatch > 0 ? (
        <>
          <p className="text-center text-xs text-zinc-500">{t("me.nfts.explain")}</p>
          <button
            onClick={() => void mint()}
            disabled={busy}
            className="mx-auto rounded-full bg-zinc-900 px-6 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {state === "sending" || state === "fetching-voucher"
              ? t("me.nfts.minting")
              : state === "confirming"
                ? t("me.nfts.confirming")
                : t("me.nfts.mint").replace("{count}", status.nextBatch.toLocaleString())}
          </button>
          {status.recorded > status.maxPerTx && (
            <p className="text-center text-[11px] text-zinc-400">
              {t("me.nfts.more").replace("{max}", status.maxPerTx.toLocaleString())}
            </p>
          )}
        </>
      ) : (
        <p className="text-center text-xs text-zinc-500">{t("me.nfts.allMinted")}</p>
      )}

      {state === "done" && lastMinted > 0 && (
        <p className="text-center text-xs text-green-700">
          {t("me.nfts.done").replace("{count}", lastMinted.toLocaleString())}
        </p>
      )}
      {state === "no_fee" && (
        <p className="text-center text-xs text-red-600">{t("me.nfts.noFee")}</p>
      )}
      {state === "error" && (
        <p className="text-center text-xs text-red-600">{t("me.nfts.error")}</p>
      )}
    </div>
  );
}
