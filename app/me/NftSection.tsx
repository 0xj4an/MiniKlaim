"use client";

import { groupNumber } from "@/lib/formatNumber";
import { useLocale } from "@/lib/i18n";
import { type TokenStatus, useMintTokens } from "@/lib/wallet/useMintTokens";

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
 * the allowlist while the note was up, so the first real mint is the proof:
 * watch `nft_mint_confirmed` against `nft_mint_failed`.
 */
/** The quoted dollar cost for a batch, or null when the chain was unreadable. */
function priceOf(status: TokenStatus, count: number): number | null {
  return status.quotes.find((q) => q.count === count)?.usd ?? null;
}

/**
 * "Mint 586 blocks as NFTs · about $0.31". The price is appended rather than
 * baked into the string so a failed quote simply leaves the old wording,
 * instead of a button that says "about $null".
 */
function label(template: string, count: number, usd: number | null): string {
  const base = template.replace("{count}", count.toLocaleString());
  if (usd === null) return base;
  return `${base} · ~$${usd.toFixed(2)}`;
}

export function NftSection({ address }: { address: `0x${string}` | null }) {
  const { t, locale } = useLocale();
  const { status, state, mint, mintFree, freeToday, lastMinted } =
    useMintTokens(address);
  if (!address || !status?.enabled) return null;
  const others = (status.others ?? []).filter(
    (w) => w.tokens > 0 || w.recorded > 0,
  );
  if (status.recorded === 0 && status.tokens === 0 && others.length === 0) {
    return null;
  }
  // Blocks from runs not claimed yet are on no chain, in any wallet.
  const unrecorded =
    (status.unrecorded ?? 0) +
    (status.others ?? []).reduce((sum, w) => sum + w.unrecorded, 0);
  const total =
    status.tokens +
    status.recorded +
    unrecorded +
    others.reduce((sum, w) => sum + w.tokens + w.recorded, 0);
  const otherLeft = others.reduce((sum, w) => sum + w.recorded, 0);
  // "Your other wallet" with one, "another wallet of yours" with several.
  const many = others.length > 1;

  const busy =
    state === "fetching-voucher" ||
    state === "sending" ||
    state === "confirming";

  return (
    <div className="flex flex-col gap-2 mk-flat px-4 py-3 text-sm">
      <p className="text-center text-xs font-semibold text-zinc-800">
        {t("me.nfts.header")}
      </p>
      {/* One wallet's count sat under a profile that counts every wallet
          of the player's, so the two numbers disagreed. Each wallet gets
          its lines and the total at the bottom is the profile's number. */}
      <ul className="flex flex-col gap-1.5 text-left">
        <Line
          n={status.tokens}
          label={t("me.nfts.row.tokens")}
          locale={locale}
        />
        {status.recorded > 0 && (
          <Line
            n={status.recorded}
            label={t("me.nfts.row.recorded")}
            locale={locale}
          />
        )}
        {others.map((w) => (
          <li key={w.address} className="flex flex-col gap-1.5">
            <ul className="flex flex-col gap-1.5">
              {w.tokens > 0 && (
                <Line
                  n={w.tokens}
                  label={t(
                    many
                      ? "me.nfts.row.tokensAnother"
                      : "me.nfts.row.tokensOther",
                  )}
                  locale={locale}
                />
              )}
              {w.recorded > 0 && (
                <Line
                  n={w.recorded}
                  label={t(
                    many
                      ? "me.nfts.row.recordedAnother"
                      : "me.nfts.row.recordedOther",
                  )}
                  locale={locale}
                />
              )}
            </ul>
            <p className="pl-[5.125rem] text-xs leading-tight break-all text-zinc-500">
              {w.address}
            </p>
          </li>
        ))}
        {unrecorded > 0 && (
          <Line
            n={unrecorded}
            label={t("me.nfts.row.unrecorded")}
            locale={locale}
          />
        )}
        <li className="mt-0.5 flex items-baseline gap-2.5 border-t border-zinc-200 pt-2">
          <span className="mk-num w-[4.5rem] shrink-0 text-right text-xl leading-none text-zinc-900">
            {groupNumber(total, locale)}
          </span>
          <span className="text-sm font-semibold text-zinc-900">
            {t("me.nfts.row.total")}
          </span>
        </li>
      </ul>
      {otherLeft > 0 && (
        <p className="text-xs leading-snug text-zinc-600">
          {t("me.nfts.row.recordedOtherHint")}
        </p>
      )}

      {status.nextBatch > 0 ? (
        <>
          <p className="text-center text-xs text-zinc-500">
            {t("me.nfts.explain")}
          </p>
          {freeToday > 0 ? (
            // No balance for the fee: the relayer mints up to 100 a day.
            <>
              <button
                onClick={() => void mintFree()}
                disabled={busy}
                className="mk-btn mk-btn-sm mk-btn-ink mx-auto px-6 disabled:opacity-60"
              >
                {state === "sending"
                  ? t("me.nfts.minting")
                  : t("me.nfts.mintFree").replace(
                      "{count}",
                      freeToday.toLocaleString(),
                    )}
              </button>
              <p className="text-center text-[12px] text-zinc-400">
                {t("me.nfts.freeNote")}
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => void mint()}
                disabled={busy}
                className="mk-btn mk-btn-sm mk-btn-ink mx-auto px-6 disabled:opacity-60"
              >
                {state === "sending" || state === "fetching-voucher"
                  ? t("me.nfts.minting")
                  : state === "confirming"
                    ? t("me.nfts.confirming")
                    : label(
                        t("me.nfts.mint"),
                        status.nextBatch,
                        priceOf(status, status.nextBatch),
                      )}
              </button>
              {status.smallBatch !== null && (
                <button
                  onClick={() => void mint(status.smallBatch ?? undefined)}
                  disabled={busy}
                  className="mx-auto text-xs text-zinc-600 underline underline-offset-2 disabled:opacity-60"
                >
                  {label(
                    t("me.nfts.mintSmall"),
                    status.smallBatch,
                    priceOf(status, status.smallBatch),
                  )}
                </button>
              )}
              {status.plan && status.plan.signatures > 1 && (
                <p className="text-center text-[12px] text-zinc-400">
                  {(status.plan.usd === null
                    ? t("me.nfts.planNoPrice")
                    : t("me.nfts.plan").replace(
                        "{usd}",
                        status.plan.usd.toFixed(2),
                      )
                  )
                    .replace("{count}", status.recorded.toLocaleString())
                    .replaceAll(
                      "{signatures}",
                      status.plan.signatures.toLocaleString(),
                    )
                    .replace("{max}", status.maxPerTx.toLocaleString())}
                </p>
              )}
            </>
          )}
        </>
      ) : (
        otherLeft === 0 &&
        unrecorded === 0 && (
          <p className="text-center text-xs text-zinc-500">
            {t("me.nfts.allMinted")}
          </p>
        )
      )}

      {state === "done" && lastMinted > 0 && (
        <p className="text-center text-xs text-green-700">
          {t("me.nfts.done").replace("{count}", lastMinted.toLocaleString())}
        </p>
      )}
      {/* Said in both cases. With free mints left the button above quietly
          became "mint 100 for free" and nothing said the paid mint had been
          refused: a wallet that asked, failed, and a screen that looked the
          same (26 Nov 2026). */}
      {state === "no_fee" && (
        <p role="status" className="text-center text-xs text-red-600">
          {freeToday > 0
            ? t("me.nfts.noFeeFree").replace(
                "{count}",
                freeToday.toLocaleString(),
              )
            : t("me.nfts.noFee")}
        </p>
      )}
      {state === "refused" && (
        <p className="text-center text-xs text-amber-700">
          {t("me.nfts.refused")}
        </p>
      )}
      {state === "error" && (
        <p className="text-center text-xs text-red-600">{t("me.nfts.error")}</p>
      )}
    </div>
  );
}

/** A count and what it counts, the numbers in one column so they add up. */
function Line({
  n,
  label,
  locale,
}: {
  n: number;
  label: string;
  locale: "en" | "es";
}) {
  return (
    <li className="flex items-baseline gap-2.5">
      <span className="mk-num w-[4.5rem] shrink-0 text-right text-lg leading-none text-zinc-900">
        {groupNumber(n, locale)}
      </span>
      <span className="text-sm text-zinc-700">{label}</span>
    </li>
  );
}
