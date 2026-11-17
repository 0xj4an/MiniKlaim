/**
 * Whether redeeming a link code is offered inside MiniPay.
 *
 * Off since 17 Nov 2026: the redeem sends a 0-value transaction with calldata
 * to the link verifier, and MiniPay refused every one (482 tries in the 30
 * days to 13 Nov, 0 linked; 349 tries by 205 people from 12 to 17 Nov). They
 * said they would allow it. When they do, set MINIPAY_LINK_REDEEM=1 and
 * restart: the code redeem comes back in MiniPay without a rebuild.
 *
 * A plain server variable read per request, like CHALLENGE_ENTRIES_PAUSED,
 * not NEXT_PUBLIC_*: those are baked in at build time.
 */
export function minipayLinkRedeemEnabled(): boolean {
  const raw = (process.env.MINIPAY_LINK_REDEEM ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}
