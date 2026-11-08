/**
 * Whether entering a challenge is paused.
 *
 * Paused on 8 Nov 2026 because the entry flow cannot complete in the wallet
 * almost every player uses. Of the 15 people who reached the approval step,
 * 14 were refused by MiniPay with `-32604 Permission denied` on an ERC-20
 * `approve` of USDT (MINIKLAIM-1S, 13 players). 281 people had viewed a
 * challenge by then and `challenge_entered` had fired zero times: nobody has
 * ever entered one.
 *
 * MiniPay restricting `approve` is plausibly deliberate rather than a bug on
 * their side, since an open allowance is the usual phishing vector, so this
 * stays paused until they answer. If the answer is no, the fee has to be
 * collected without an allowance and the pause outlives the flag.
 *
 * Deliberately a plain server variable and not `NEXT_PUBLIC_*`: those are
 * baked at build time, so unpausing one would mean a rebuild, and
 * `lib/envSkew` exists because that mismatch has bitten this project twice
 * (P39, P60). This one is read per request, so unpausing is a variable change
 * and a restart.
 *
 * The server is the authority. The card hides its button from the same flag,
 * but a player who kept an old tab open, or anyone calling the API directly,
 * is refused by `POST /api/challenges/[id]/enter` rather than by the UI.
 */
export function challengeEntriesPaused(): boolean {
  const raw = (process.env.CHALLENGE_ENTRIES_PAUSED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}
