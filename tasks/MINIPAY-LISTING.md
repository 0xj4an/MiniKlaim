# MiniPay Listing Gap Analysis

Source of truth: `celopedia-skill/references/minipay-requirements.md` (Opera MiniPay "Build for MiniPay: Developer Requirements" PDF).

Listing is a **two-stage process**:

1. **Stage 1 - Intake form** at `https://minipay.to/mini-apps`. Triage on quality. Submitting a half-built app gets you deprioritized for follow-up.
2. **Stage 2 - Readiness checklist** sent after the first call. Full assessment.

Last audited: 2026-05-22.

---

## Stage 1 readiness scorecard

Items the intake reviewer can see at a glance. **Do not submit until every row is GREEN.**

| Item | Status | Evidence / fix |
|------|--------|----------------|
| Zero-click connect when `window.ethereum.isMiniPay === true` | GREEN | `lib/wallet/useWallet.ts` auto-fires `wagmiConnect` on MiniPay detection. Verified. |
| No `personal_sign` / `eth_signTypedData` anywhere | GREEN | Repo-wide grep: no calls. Auth = wallet address only. |
| No raw `0x...` addresses as primary identifier | YELLOW | Primary is `@username`. **But:** `/me` and `/p/[username]` show truncated `0x...` as secondary in places. Privacy + ToS reference "wallet address (Ethereum-format, 42 chars)" as identity. Acceptable, but soften "wallet address" copy to "your MiniPay wallet" where possible. |
| UI copy: "Network fee" / "Deposit" / "Withdraw" / "Stablecoin" | YELLOW | Two i18n keys use "crypto wallet" (`home.env.telegram.body`, `home.env.noWallet.body`). Rephrase to "MiniPay wallet" or just "wallet". |
| All contracts verified on Celoscan | GREEN | HexNFT at `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` verified (per commit `a458891`). Badges contract not deployed yet - blocker for Stage 2, not Stage 1. |
| Sample tx hashes for every user-facing method | RED | None collected yet. **Action:** after Day 3 wires the backend, capture 3 sample txs: `capture`, `captureBatch`, `setBaseURI`. |
| Tested at 360 x 640 | UNKNOWN | Manual check needed in Chrome DevTools mobile mode + real device. |
| Images SVG or WebP | GREEN | All app icons via Next `icon.tsx` / `apple-icon.tsx` (generated SVG). Manifest icons inline. No raw PNG/JPG. |
| PageSpeed Insights score captured (90+ target) | RED | Never run. **Action:** `https://pagespeed.web.dev/analysis?url=https://miniklaim.fun` and screenshot. |
| Redirects to Deposit deeplink on insufficient balance | N/A | App is free. No purchase flow today. |
| App name + logo visible, distinct from MiniPay | GREEN | Orange "MiniKlaim" wordmark + icon, distinct branding. |
| Terms + Privacy linked in-app | GREEN | `/about`, `/privacy`, `/terms` all live, linked from nav. |
| At least 3 high-quality screenshots ready | RED | Not collected yet. **Action:** home + run-in-progress + me-with-hexes + community-map. 4 shots, PNG <= 500 KB each. |
| Live App URL | GREEN | `https://miniklaim.fun` deployed. |
| Social media (Twitter/X or similar) | RED | None exists. **Action:** create @miniklaim or @miniklaim_app on X. Cross-post on Farcaster. |

### Stage 1 blocker list

Order of operations to get to a clean intake submission:

1. Fix the two "crypto wallet" i18n strings (5 min).
2. Run PageSpeed Insights on prod, screenshot, fix the worst regressions if score < 85 (1-2 hours).
3. Manual 360x640 test in DevTools + on a real phone (15 min).
4. Capture 4 screenshots in 360x640 mode (30 min).
5. Create X account, post first thread with screenshots (30 min).
6. Capture sample tx hashes once backend writes to the contract (Day 3-4 of roadmap).

Then submit Stage 1.

---

## Stage 2 full checklist (post-first-call)

Status snapshot below. Items added by MiniKlaim beyond the official list are marked `[+]`.

### 1. Seamless UX

- [x] Zero-click connect inside MiniPay
- [x] No message signing anywhere
- [~] Phone-first identity - **Gap:** we use `@username` which is acceptable, but we have not wired ODIS / FederatedAttestations to resolve actual phone numbers. **Decision:** keep `@username` as primary; revisit ODIS if MiniPay reviewer flags it.

### 2. Currency & Stablecoin

- [x] Only USDT / USDC / USDm displayed - **Currently:** we display none at all (no balance UI yet). When season pass ships in Phase 2, follow `minipay-templates.md` Preferred Stablecoin Selection.
- [x] No CELO displayed anywhere
- [N/A] Single-token graceful degradation - no token UI yet

### 3. User-Facing Copy

- [~] **Gap (2 strings):** "crypto wallet" in `i18nDict.ts:22` and `:27` (`home.env.telegram.body`, `home.env.noWallet.body`). Replace with "wallet".
- [x] All other copy clean (verified by grep). "Gas", "onramp", "offramp" not present in user-facing strings.

### 4. Performance

- [ ] **PageSpeed mobile 90+** - never measured. Top action item.
- [ ] **URL/subdomain manifest** - need to write. Suspects: `miniklaim.fun`, `forno.celo.org`, `api.celoscan.io`, `tile.openstreetmap.org` (or whatever map tiles), Vercel/Railway proxies. Document precisely once measured.
- [x] Asset optimization - SVG/WebP only.

### 5. Smart contract standards

- [x] HexNFT verified on Celoscan
- [ ] Badges contract deployed + verified
- [ ] Sample tx hashes for `capture` (mint case), `captureBatch` (steal case), `setBaseURI`
- [ ] Sample tx hashes for Badges `mint`, `mintBatch`

### 6. Integration & Support

- [ ] **In-app support link** - not present. **Action:** add a "Help" link in `/about` footer to a Telegram chat (`https://t.me/miniklaim_support` or DM the founder).
- [ ] **24h SLA for critical issues** - founder commitment. Document this in `/about`.
- [ ] **AI support agent on Telegram (recommended)** - long-arc. Backlog item in `IMPROVEMENTS.md`. Use Claude API + prompt caching.
- [N/A] **Deposit deeplink on low balance** - no payment flow yet.

### 7. Branding & Legal

- [x] Name + logo
- [x] ToS + Privacy linked
- [ ] Tweak ToS/Privacy: state "MiniKlaim is operated by [founder/entity name], not MiniPay". Currently implied; make it explicit.

### 8. Analytics & Operational Visibility

The `/stats` page exists today but is **not** MiniPay-listing-grade. Current metrics:
- Total players, total blocks, runs lifetime
- Runs 7d / 24h, active players 7d
- Total distance meters

**Gaps vs. official requirement:**

| Required metric | Have? | Action |
|-----------------|-------|--------|
| DAU | partial | Add `activePlayers24h` to analytics endpoint |
| MAU | NO | Add `activePlayers30d` |
| D1/D7/D30 retention cohorts | NO | New SQL: for each cohort_date, count runners who returned at day 1/7/30 |
| Top countries | NO | Need IP geo. Add Cloudflare `cf-ipcountry` or similar at edge. |
| Tx per day/week/month/lifetime per contract method | NO | Add `tx_log` table that mirrors mint queue. Aggregate on `/stats`. |
| Unique on-chain users per period | NO | DISTINCT `tx.from` over time window. |
| Volume per stablecoin | N/A | No volume yet (no payments) |
| Network fees paid by users | N/A | Server pays gas; no user-paid fees |
| Protocol fees / revenue | N/A | No fees collected (free app) |
| Failed-tx rate | NO | Compute from `mint_queue` table: `failed / total` last 7d. **High value:** surfaces production bugs. |

**Recommended new sections on `/stats`:**
- "Lifetime" (existing + total on-chain captures + unique on-chain players)
- "Active users" (DAU / WAU / MAU)
- "Retention" (D1 / D7 / D30)
- "On-chain" (txs 24h / 7d / 30d, failed-tx rate, top method)
- "Reach" (top 5 countries)

---

## Submission timeline

| Date | Milestone |
|------|-----------|
| 2026-05-22 | Audit done (this doc) |
| 2026-05-23 to 25 | Fix Stage 1 blockers (copy strings, PageSpeed, screenshots, X account) |
| 2026-05-26 to 28 | Backend wired to HexNFT (Day 3 of roadmap), Badges deployed (Day 4-5) |
| 2026-05-29 | **Celo Proof of Ship submission** (campaign deadline) |
| 2026-05-30 to 06-05 | Capture sample tx hashes, build analytics endpoints (DAU/MAU/retention/failed-tx) |
| 2026-06-06 to 12 | Polish, add Telegram support, write URL manifest |
| 2026-06-13 | **MiniPay Stage 1 intake submission** |
| TBD | First MiniPay call -> Stage 2 readiness form |

---

## Pre-submission dress rehearsal

Day before submission, do all of the following on a single physical device inside the real MiniPay wallet:

1. Open `https://miniklaim.fun` from MiniPay's in-app browser. App connects with zero taps.
2. Pick a username (no Telegram-style "internal error").
3. Start a run. Walk 500 meters. Capture 3 hexes.
4. Finish the run. Verify hex NFTs minted on Celoscan within 30 seconds.
5. Open `/me`. See the hexes with Celoscan links.
6. Open `/community`. See yourself on the leaderboard.
7. Open `/stats`. Verify your run shows up in 24h totals.
8. Background the app for 5 minutes. Reopen. Still logged in. State preserved.
9. Switch system language to Spanish. Verify all UI translates.
10. Run PageSpeed mobile on prod URL. Score recorded.

Any failure -> not ready. Fix and rehearse again.
