# Relayer costs

Players pay the network fee on their own claim (USDT, then USDC, then USDm) when they confirm.

The relayer at `0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83` mints when the player has no fee balance, when the claim fails for a reason other than a declined signature, and when `npm run runs:retry-unminted` finds a run still unminted 15 minutes later (20 runs per pass). A declined signature does not call the relayer in that moment.

`POST /api/runs/[id]/sponsor-mint` and `POST /api/users/[address]/badges/sponsor-mint` are the immediate path.
