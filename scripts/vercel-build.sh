#!/usr/bin/env bash
set -euo pipefail

# Smart Vercel build strategy:
# - Markdown-only content updates use passthrough image service to avoid
#   expensive image optimization work.
# - All other changes use full build behavior.

if ! git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  echo "No previous commit; running full Astro build."
  npx --no-install astro build
  exit 0
fi

changed_files="$(git diff --name-only HEAD^ HEAD)"

if [[ -z "$changed_files" ]]; then
  echo "No changed files found; running full Astro build."
  npx --no-install astro build
  exit 0
fi

markdown_only_pattern='^src/content/posts/.*\.(md|mdx)$'
markdown_only=1

while IFS= read -r file; do
  if [[ ! "$file" =~ $markdown_only_pattern ]]; then
    markdown_only=0
    break
  fi
done <<< "$changed_files"

if [[ "$markdown_only" -eq 1 ]]; then
  echo "Detected markdown-only content change; enabling passthrough images for faster build."
  ASTRO_PASSTHROUGH_IMAGES=1 npx --no-install astro build
else
  echo "Detected site/code/image change; running full Astro build."
  npx --no-install astro build
fi
