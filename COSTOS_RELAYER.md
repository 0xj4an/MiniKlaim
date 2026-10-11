# Relayer costs

Players pay the network fee on their own claim (USDT, then USDC, then USDm, or CELO) when they confirm.

The relayer at `0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83` mints only when the server agrees:

- The caller presents the run token issued when the run started (`x-run-token`).
- The player cannot pay: the server reads their CELO and fee-stablecoin balances on-chain and refuses (402) when any one of them covers the estimated fee. Runs over 700 hexes do not fit one player tx and count as "cannot pay".
- The wallet is under its daily allowance: `SPONSOR_DAILY_HEX_CAP` hexes (default 200) and `SPONSOR_DAILY_BADGE_TX_CAP` badge txs (default 2) per rolling 24h. Every sponsored tx is logged in `sponsored_mints`.

A declined signature is recorded as `declined` and never sponsored. The retry cron (`npm run runs:retry-unminted`, every 4h) only retries runs marked `sponsor_failed`, where the server had agreed and the relayer or RPC failed.

When the relayer drops under `RELAYER_LOW_BALANCE_CELO` (default 5 CELO) the web service sends a "relayer balance low" error to Sentry, at most every 30 minutes.

`POST /api/runs/[id]/sponsor-mint` and `POST /api/users/[address]/badges/sponsor-mint` are the immediate path.
