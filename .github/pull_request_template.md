## Summary

<!--
1-3 sentences: what the PR changes and why. Include the linked issue if any.
-->

## Type of change

- [ ] `feat`: new user-facing feature
- [ ] `fix`: bug fix (specify severity)
- [ ] `refactor`: internal restructure, no behavior change
- [ ] `perf`: measurable performance improvement
- [ ] `docs`: documentation only
- [ ] `chore`: tooling, dependencies, build, CI
- [ ] `test`: adding or fixing tests
- [ ] `contracts`: Solidity change (see extra checklist below)

## Test plan

<!--
Checklist of how you verified the change. Include hosts tested (MiniPay / Farcaster / Startale / browser).
-->

- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run build` passes
- [ ] (if applicable) `cd contracts && forge test` passes
- [ ] Manual smoke test in the affected host(s):
  - [ ] MiniPay
  - [ ] Farcaster Mini App
  - [ ] Startale (Soneium)
  - [ ] Browser wallet

## Screenshots / screen recording

<!-- For any UI change. Attach directly to the PR. -->

## Contracts checklist (only if you touched Solidity)

- [ ] All existing Foundry tests still pass
- [ ] New tests added for new behavior (happy path + revert cases)
- [ ] Gas snapshot noted for changed functions (if hot-path)
- [ ] Storage layout unchanged, or `__gap` reduced accordingly to preserve UUPS upgradeability
- [ ] Access-control roles reviewed (`DEFAULT_ADMIN_ROLE` gates upgrade; operational roles per contract)
- [ ] `SECURITY.md` architecture-notes section updated if the contract's threat model changed

## Rollback plan

<!--
How would we revert if this breaks in prod? `git revert <sha>`? Any DB migration that would need reversal?
-->

## Additional notes for reviewers

<!--
Anything a reviewer should know, non-obvious trade-offs, follow-up work planned in a separate PR.
-->
