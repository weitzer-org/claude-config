# claude-config

Version-controlled `~/.claude` configuration: the custom agent types, the
PostToolUse/UserPromptSubmit hooks, and the settings that wire them up.

Everything here exists to fix one measured problem. An analysis of 57 Claude
Code sessions (18,174 assistant turns) across `gsr`, `job_tracker`,
`sound-profile-builder` and `gym-tracker` found that essentially every
significant error had the same shape: **a confident claim about a system
outside the repo, used as a load-bearing premise, never checked.** Local code
grounding was fine — only 3% of 1,674 edits touched a file not read first.

This repo is the single source of truth for the agents and the shared
guidance (routing plus verification discipline). It reaches sessions two ways,
because cloud sessions (claude.ai/code) don't see anything under `~/.claude`:

| Surface | What it gets | How |
|---|---|---|
| Local terminal / desktop / IDE | agents, hooks, settings | `./install.sh` symlinks into `~/.claude` |
| Cloud sessions (and local, per project) | agents + rules | `./sync-project.sh <repo>` vendors them into the project's `.claude/`, committed; `.github/workflows/propagate.yml` opens the sync PRs automatically |

A project's own `.claude/agents/<name>.md` overrides the user-level one of the
same name, so vendored and symlinked copies never load twice.

## What's here

### `claude/agents/`

Agent types whose **model is pinned in frontmatter**, so a forgotten `model:`
parameter on an `Agent` call cannot silently downgrade the work to the
conversation model.

| Agent | Model / effort | Use |
|---|---|---|
| `scout` | haiku | Read-only "where is X / how does Y flow" searches |
| `test-runner` | haiku | Run the suites, return only failures + likely causes |
| `reviewer` | sonnet / medium | Single-pass diff review before a PR |
| `pr-triage` | sonnet / low | Classify review comments into the triage ledger |
| `planner` | opus / high | Plan before large or architecturally risky changes |
| `security-reviewer` | opus / high | Adversarial pass on auth, secrets, storage, LLM-output rendering |
| `opus-verifier` | opus / high | Premise checking, measurement validity, and specifically the moment before dismissing a review finding as a false positive |
| `fable-reviewer` | fable / high | Simplification, framing, "is there a fundamentally easier way". **Ask-only** (~2.5x Opus per token) |

Cheap agents (haiku/sonnet) are meant to run freely; opus agents only on the
named triggers in `claude/rules/agent-routing.md`; fable only when asked.

Rationale: Opus was **0.19%** of those 18,174 turns — in one repo, 0 of 8,415 —
even though three CLAUDE.mds routed Opus work through per-phase tables in
design docs. A table nobody opens never fires.

### `claude/rules/`

| Rule | Content |
|---|---|
| `agent-routing.md` | Which agent to use for which signal, the verifier triggers, spawn rules |
| `verification-discipline.md` | The verify-or-label rule, its corollaries, and the review-round triage ledger |

These are **not** linked into `~/.claude/rules` by `install.sh`: they are
vendored into each project instead (below), and a user-level copy would load
the same text twice in every local session of a synced project.

### `sync-project.sh` and `targets.txt`

```bash
./sync-project.sh ../sound-profile-builder          # vendor agents + rules into .claude/
./sync-project.sh --check ../sound-profile-builder  # exit 1 if the vendored copy is stale
```

It records what it manages in `.claude/claude-config.lock`, deletes files that
were dropped here, and refuses to overwrite a project's own same-named file
unless you pass `--force`. `propagate.yml` runs it against every repo in
`targets.txt` on each push to `main` that touches agents or rules, and opens a
PR per repo. It needs a `TOOLKIT_SYNC_TOKEN` secret (fine-grained PAT, Contents
+ Pull requests read/write on the target repos); without it the job skips.

### Plugin manifest

`.claude-plugin/marketplace.json` + `claude/.claude-plugin/plugin.json` make
this repo a private plugin marketplace exposing the agents (only the agents:
hooks and settings stay with `install.sh`). Not used for day-to-day delivery;
it exists so the same agents can be uploaded to a claude.ai account or added
with `claude plugin marketplace add weitzer-org/claude-config` if that route
turns out to reach cloud sessions. Validate after edits with
`claude plugin validate .`.

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

`settings.json` defaults the main session to **Sonnet at medium effort**
(quota policy: escalate with `/model` / `/effort` or via the pinned agents).

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
go install golang.org/x/tools/gopls@latest
go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest
```

then fix the paths in `settings.json` to match.

## What is deliberately not here

`.credentials.json`, `.claude.json`, `settings.local.json`, session
transcripts, and project state — all gitignored. This repo is private, but
credentials do not belong in git regardless.
