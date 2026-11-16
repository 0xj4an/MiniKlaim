#!/usr/bin/env bash
#
# Decide which CI jobs a change needs, from the list of files it touched.
#
#   printf '%s\n' "$files" | .github/scripts/ci-changes.sh
#
# Reads one path per line on stdin and prints two lines, `contracts=true|false`
# and `web=true|false`, in the format GITHUB_OUTPUT takes.
#
# The rule is "skip only what is provably untouched", so every doubt runs the
# job:
#   - no input at all, or the literal line `__all__`, runs both. The caller
#     sends `__all__` when it could not get the list.
#   - a change to the CI workflow or to this script runs both, because it can
#     change what either job means.
#   - contracts/ is the Foundry project. Nothing in the web app reads it: the
#     ABIs the app uses are TypeScript files under lib/onchain, and eslint,
#     tsc (via next) and vitest all exclude contracts/.
#   - docs, ops scripts, markdown and GitHub templates are read by neither job.
#   - anything else is the web app.
set -euo pipefail

contracts=false
web=false
seen=0

while IFS= read -r file || [ -n "$file" ]; do
  [ -n "$file" ] || continue
  seen=1
  case "$file" in
    __all__ | .github/workflows/ci.yml | .github/scripts/ci-changes.sh)
      contracts=true
      web=true
      ;;
    contracts/*)
      contracts=true
      ;;
    docs/* | ops/* | *.md | LICENSE | .github/ISSUE_TEMPLATE/* | .github/workflows/*)
      ;;
    *)
      web=true
      ;;
  esac
done

if [ "$seen" -eq 0 ]; then
  contracts=true
  web=true
fi

echo "contracts=$contracts"
echo "web=$web"
