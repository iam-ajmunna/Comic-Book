#!/usr/bin/env bash
set -euo pipefail
repo='iam-ajmunna/Comic-Book'
command -v gh >/dev/null || { echo 'Install the official GitHub CLI: https://cli.github.com/' >&2; exit 1; }
gh auth status
if gh api "repos/$repo/pages" --jq .html_url 2>/dev/null; then
  echo 'GitHub Pages is already configured; its settings were preserved.'
else
  gh api --method POST "repos/$repo/pages" -f 'source[branch]=main' -f 'source[path]=/' --jq .html_url
fi
