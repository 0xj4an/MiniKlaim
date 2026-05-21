# MiniKlaim Roadmap

Living document. Update as we ship things. Reorder when priorities change.

Last updated: 2026-05-21

---

## Where we are right now

- App built end-to-end on `dev` branch: 70+ pasos of features.
- Dev URL on Railway works: `web-development-e186.up.railway.app`. Testers using it.
- `www.miniklaim.fun` resolves to Railway prod but prod is deploying from `main`, which only has the empty Next.js scaffold. The custom domain therefore serves a blank page.
- DNS is correctly configured (CNAME `www` + TXT `_railway-verify.www`).
- talentapp verification meta tag is on `dev`, not yet on prod.

## What's blocking shipping

The only blocker is: **`main` is stale**. Everything else is ready.

---

## Plan, in order

### 1. Unblock prod  (now)

- Merge `dev` -> `main` locally. Review the diff.
- User pushes `main`. Railway redeploys prod from the latest commit.
- talentapp domain verification picks up the meta tag.
- `www.miniklaim.fun` starts serving the real app.

**Owner:** Claude prepares merge, user pushes.

### 2. Apex domain  (next)

- Add `miniklaim.fun` (no `www`) as a second custom domain on Railway prod.
- Add the DNS records Railway gives us (usually `ALIAS @` or `A @` plus a `TXT _railway-verify`).
- Confirm both `miniklaim.fun` and `www.miniklaim.fun` resolve to the same app.

**Owner:** Claude wires Railway + Namecheap via MCP, user reviews.

### 3. Real-user tester loop  (continuous)

- Each round of feedback turns into pasos like 70, 71 (tester fixes).
- Track recurring issues in this file under "Tester reports" so patterns stay visible.

**Owner:** User collects feedback, Claude implements.

### 4. MiniPay listing prep  (when 1-3 stable)

Per `celopedia-skill > minipay-requirements`. Two-stage process:

- Stage 1 (intake form at <https://minipay.to/mini-apps>): screenshots, app description, category, contact. **User-facing assets.**
- Stage 2 (post-call readiness): UI copy audit (already done in pasos 31, 37, 38), PageSpeed 90+ (perf passes in pasos 57, 58), Privacy / Terms (done), in-app support contact (done), 360x640 mobile-first (already mobile-first).

Remaining for stage 2:
- Run PageSpeed Insights on prod after step 1 lands; fix any sub-90 metrics.
- Pick 3 screenshots, export at PNG / WebP under 500KB each.
- Write the short description (~150 chars) + long description.

**Owner:** User drives Stage 1 form, Claude helps with anything code-side.

### 5. Financial incentives  (future, user-driven)

User intent: rewards, badge mints, possibly token-gated runs.

When the mechanic is defined:

- Contract design (Solidity, deploy via Foundry on Celo).
- Wire to existing `useBalances` infra (kept in place in paso 71's revert).
- New `/rewards` surface or extend `/me`.
- Document in `JOURNAL.md` like every other paso.

**Owner:** User defines mechanic, Claude implements.

### 6. Friend / follow system  (future)

Schema work needed. Defer until user asks for it.

---

## Tester reports

Track recurring issues here so patterns stay visible across sessions.

### 2026-05-21 - Telegram tester

- "Sign in to play" did nothing inside Telegram in-app browser. **Fixed paso 70** (env detection -> shows "Open in your browser" with Copy-link).
- "Internal error" when saving username. **Fixed paso 70** (API now surfaces the real DB error). **Fixed paso 71** (form submits on Enter, clears error on edit, lowercase keyboard).
- Auto-switch to Celo instead of asking. **Fixed paso 70** (auto-fires switchChain on detection).

### 2026-05-21 - "Smoothly built" reviewer

- "Tap Start running on the home page" ambiguous. **Fixed paso 72** (rephrased to "From the home screen, tap Start running.").
- "Your money" feels disconnected from running. **Fixed paso 72** (renamed to "Wallet" with subtitle "Rewards and badges coming soon"). User confirms: keep wallet visible, plan to integrate rewards later.
- "Will there be financial incentive?" - Yes. See section 5 above.

---

## Done shipping

High-level milestones, not every paso. For per-paso detail see `JOURNAL.md`.

- Core gameplay: GPS run tracking, H3-12 hex claiming, real-time map.
- MiniPay integration: auto-connect, fee abstraction, supported tokens only.
- Profile: username system, public profile at `/p/[username]`, joined date, badges (10).
- Social: clickable usernames everywhere, share to Telegram / WhatsApp / X via Web Share API, dynamic OG image per profile.
- Community: leaderboard, activity feed, world map with city dots + hex polygons (64-city seed).
- Stats: public `/stats` page, personal `/me` page with stats, streak, achievements, territory map, wallet.
- i18n: full EN/ES coverage including server-rendered routes and OG image.
- Perf: maplibre deferred off home critical path, CLS reserved, route error / 404 boundaries.
- Legal: Privacy + Terms pages with bilingual copy.
- PWA: manifest, icons (192, 512, apple-touch), viewport meta.
- Help: `/about` with how-to and FAQ.
- Tester polish: paso 70 (3 blockers), paso 71 (form UX), paso 72 (copy + wallet rename).
