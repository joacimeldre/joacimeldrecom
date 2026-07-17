#!/usr/bin/env bash
set -euo pipefail

# Exit code contract for Vercel ignoreCommand:
# - 0 => skip build
# - 1 => proceed with build

# If there is no previous commit to diff against, always build.
if ! git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  echo "No previous commit found; running build."
  exit 1
fi

changed_files="$(git diff --name-only HEAD^ HEAD)"

# No file changes means no build needed.
if [[ -z "$changed_files" ]]; then
  echo "No changed files detected; skipping build."
  exit 0
fi

# Files that are safe to ignore for deployment builds.
# If every changed file matches one of these patterns, skip build.
safe_skip_pattern='^(README\.md|LICENSE|\.gitignore|\.nvmrc|\.DS_Store|\.vscode/|\.idea/)'

needs_build=0
while IFS= read -r file; do
  if [[ ! "$file" =~ $safe_skip_pattern ]]; then
    needs_build=1
    break
  fi
done <<< "$changed_files"

if [[ "$needs_build" -eq 1 ]]; then
  echo "Site-impacting files changed; running build."
  exit 1
fi

echo "Only non-site metadata files changed; skipping build."
exit 0
