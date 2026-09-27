#!/usr/bin/env bash
# Vendor claude/agents and claude/rules into a project repo's .claude/.
#
# Usage:
#   ./sync-project.sh <project-dir>           copy into <project-dir>/.claude/
#   ./sync-project.sh --check <project-dir>   report drift, exit 1 if out of date
#   add --force to overwrite a same-named file this script didn't put there
#
# Cloud sessions only see what is committed in the project repo, not ~/.claude,
# so commit the result. Managed files are listed in .claude/claude-config.lock;
# files later dropped here are deleted on the next sync, and files not in the
# lock are never touched.
set -euo pipefail

usage() { sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
check=0 force=0 dest=""
for arg in "$@"; do
  case "$arg" in
    --check) check=1 ;;
    --force) force=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *) dest="$(cd "$arg" && pwd)/.claude" ;;
  esac
done
[ -n "$dest" ] || { usage >&2; exit 2; }

lock="$dest/claude-config.lock"
rev="$(git -C "$root" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"

# One line per managed file: <path relative to .claude/> TAB <source path>
manifest() {
  local f
  for f in "$root"/claude/agents/*.md; do
    printf 'agents/%s\t%s\n' "$(basename "$f")" "$f"
  done
  for f in "$root"/claude/rules/*.md; do
    printf 'rules/claude-config/%s\t%s\n' "$(basename "$f")" "$f"
  done
}

new_paths="$(manifest | cut -f1)"
old_paths=""
[ -f "$lock" ] && old_paths="$(grep -v '^#' "$lock" || true)"
drift=0 conflicts=0

# Refuse up front, before copying anything, to overwrite files we don't own.
while IFS=$'\t' read -r rel src; do
  target="$dest/$rel"
  if [ -e "$target" ] && ! grep -qxF "$rel" <<<"$old_paths" && ! cmp -s "$src" "$target"; then
    echo "conflict: $target exists and is not managed by claude-config" >&2
    conflicts=1
  fi
done < <(manifest)
if [ "$conflicts" -eq 1 ] && [ "$force" -eq 0 ]; then
  echo "rerun with --force to overwrite, or rename the project's own file" >&2
  exit 1
fi

while IFS=$'\t' read -r rel src; do
  target="$dest/$rel"
  cmp -s "$src" "$target" 2>/dev/null && continue
  drift=1
  if [ "$check" -eq 1 ]; then
    echo "out of date: $rel"
  else
    mkdir -p "$(dirname "$target")"
    cp "$src" "$target"
    echo "updated: $rel"
  fi
done < <(manifest)

while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  grep -qxF "$rel" <<<"$new_paths" && continue
  drift=1
  if [ "$check" -eq 1 ]; then
    echo "stale: $rel"
  else
    rm -f "$dest/$rel"
    echo "removed: $rel"
  fi
done <<<"$old_paths"

if [ "$check" -eq 1 ]; then
  [ "$drift" -eq 0 ] && echo "up to date"
  exit "$drift"
fi

if [ "$drift" -eq 1 ] || [ ! -f "$lock" ]; then
  {
    echo "# Managed by weitzer-org/claude-config (sync-project.sh). Do not edit."
    echo "# Last content change synced from claude-config commit $rev"
    printf '%s\n' "$new_paths"
  } >"$lock"
  echo "wrote: claude-config.lock ($rev)"
else
  echo "up to date"
fi
