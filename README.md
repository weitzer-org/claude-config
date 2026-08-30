# claude-config

Version-controlled `~/.claude` configuration: the custom agent types, the
PostToolUse/UserPromptSubmit hooks, and the settings that wire them up.

Everything here exists to fix one measured problem. An analysis of 57 Claude
Code sessions (18,174 assistant turns) across `gsr`, `job_tracker`,
`sound-profile-builder` and `gym-tracker` found that essentially every
significant error had the same shape: **a confident claim about a system
outside the repo, used as a load-bearing premise, never checked.** Local code
grounding was fine — only 3% of 1,674 edits touched a file not read first.

The matching CLAUDE.md guidance lives in each project repo (the "Verification
discipline" section). This repo holds the parts that are machine-level rather
than project-level.

## What's here

### `claude/agents/`

Agent types whose **model is pinned in frontmatter**, so a forgotten `model:`
parameter on an `Agent` call cannot silently downgrade the work to the
conversation model.

| Agent | Model | Use |
|---|---|---|
| `opus-verifier` | opus | Premise checking, measurement validity, and specifically the moment before dismissing a review finding as a false positive |
| `fable-reviewer` | fable | Simplification, framing, "is there a fundamentally easier way" |

Rationale: Opus was **0.19%** of those 18,174 turns — in one repo, 0 of 8,415 —
even though three CLAUDE.mds routed Opus work through per-phase tables in
design docs. A table nobody opens never fires.

### `claude/hooks/`

| Hook | Event | Behavior |
|---|---|---|
| `escalation-reminder.js` | UserPromptSubmit | When a prompt mentions opus/fable plus a delegation verb, injects a reminder naming the agent types above |
| `verify-edit.js go` | PostToolUse `Write\|Edit` | `gofmt -l` + `go vet` on the containing package. Synchronous, ~1s |
| `verify-edit.js ts` | PostToolUse `Write\|Edit` | `tsc --noEmit` against the nearest tsconfig. ~10s, so wired with `asyncRewake: true` — runs in the background and wakes the model only on a real type error (exit 2) |

**These parse stdin with `node`, not `jq`, deliberately.** `jq` is not
installed on the target machine. Every stock Claude Code hook recipe pipes
through `jq`, so the by-the-book version of these hooks would have silently
done nothing forever — a no-op hook is worse than no hook, because you believe
you are covered.

## Install

```bash
./install.sh          # symlinks agents/ and hooks/, merges settings.json
```

`install.sh` will not overwrite an existing `~/.claude/settings.json` — it
writes `settings.json.new` beside it for you to merge, since that file also
carries machine-local state.

## Assumptions

`claude/settings.json` hardcodes absolute paths for this machine:

- `node` at `~/.local/bin/node` (nvm v20.20.2), **not** on the default PATH
- Go at `/usr/local/go/bin`, `gopls`/`golangci-lint` at `~/go/bin`
- `env.PATH` is set explicitly so the LSP servers and hooks can find them

On a new machine, install the toolchain first:

```bash
# Go LSP + linter
go install golang.org/x/tools/gopls@latest
go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest

# TypeScript LSP — the plugin invokes `typescript-language-server`, which is a
# separate npm package from `typescript`/`tsserver`. Without it the TS LSP
# registers and then silently does nothing.
npm install -g typescript-language-server typescript
ln -sf "$(npm root -g)/../typescript-language-server" ~/.local/bin/   # if nvm's bin isn't on PATH
```

then fix the paths in `settings.json` to match.

### Verifying the LSPs are actually usable

`enabledPlugins` in `settings.json` only registers a plugin — it does not
check that the binary it invokes exists, and a missing one fails **silently**.
Confirm against the exact PATH `settings.json` sets:

```bash
for b in gopls typescript-language-server node; do
  printf '%-28s %s\n' "$b" "$(command -v $b || echo MISSING)"
done
```

`golangci-lint` is deliberately **not** wired into the PostToolUse hook — it
takes seconds per package, too slow to run on every edit. `go vet` covers the
fast, high-value checks there. Run `golangci-lint run` by hand before opening
a PR on a Go repo.

## What is deliberately not here

`.credentials.json`, `.claude.json`, `settings.local.json`, session
transcripts, and project state — all gitignored. This repo is private, but
credentials do not belong in git regardless.
