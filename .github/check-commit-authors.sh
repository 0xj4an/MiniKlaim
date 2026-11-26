#!/usr/bin/env bash
# Fails when a commit in the pull request is authored or committed by an AI
# assistant's default identity, or carries an assistant attribution trailer.
# See .github/workflows/branch-flow.yml for why.
set -euo pipefail

bad_identity='noreply@anthropic\.com'
bad_trailer='^(co-authored-by:[[:space:]]*claude|claude-session:|.*generated with \[claude code\])'

commits="$(gh api --paginate "repos/$REPO/pulls/$PR/commits" \
  --jq '.[] | [.sha[0:7], .commit.author.email, .commit.committer.email, (.commit.message | gsub("\n"; "\u001f"))] | @tsv')"

fail=0
while IFS=$'\t' read -r sha author committer message; do
  [ -n "$sha" ] || continue
  if printf '%s\n%s\n' "$author" "$committer" | grep -Eiq "$bad_identity"; then
    echo "::error::$sha is authored or committed as $author / $committer. Set git config user.name and user.email to the maintainer and amend it."
    fail=1
  fi
  if printf '%s' "$message" | tr '\037' '\n' | grep -Eiq "$bad_trailer"; then
    echo "::error::$sha carries an assistant attribution trailer. Remove the line and amend it."
    fail=1
  fi
done <<< "$commits"

[ "$fail" -eq 0 ] && echo "commit authorship ok ($(printf '%s\n' "$commits" | grep -c . || true) commits)"
exit "$fail"
