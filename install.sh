#!/usr/bin/env bash
# Link this repo's agents and hooks into ~/.claude.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${CLAUDE_HOME:-$HOME/.claude}"

mkdir -p "$DEST"
for d in agents hooks; do
  if [ -e "$DEST/$d" ] && [ ! -L "$DEST/$d" ]; then
    echo "!! $DEST/$d exists and is not a symlink — move it aside first." >&2
    exit 1
  fi
  ln -sfn "$REPO/claude/$d" "$DEST/$d"
  echo "linked $DEST/$d -> $REPO/claude/$d"
done

if [ -f "$DEST/settings.json" ]; then
  cp "$REPO/claude/settings.json" "$DEST/settings.json.new"
  echo "NOTE: $DEST/settings.json already exists."
  echo "      Wrote $DEST/settings.json.new — merge the 'hooks', 'enabledPlugins'"
  echo "      and 'env' keys by hand; the existing file may hold machine-local state."
else
  cp "$REPO/claude/settings.json" "$DEST/settings.json"
  echo "installed $DEST/settings.json"
fi

command -v gopls >/dev/null || echo "WARN: gopls not on PATH — go install golang.org/x/tools/gopls@latest"
command -v node  >/dev/null || echo "WARN: node not on PATH — the hooks parse stdin with node and will no-op without it"
