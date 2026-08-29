#!/usr/bin/env node
// UserPromptSubmit hook: when the user explicitly asks for an Opus/Fable
// subagent, inject a reminder naming the pre-configured agent types so the
// model can't spawn a Sonnet-inheriting agent by forgetting `model:`.
let raw = '';
process.stdin.on('data', d => (raw += d));
process.stdin.on('end', () => {
  let prompt = '';
  try {
    const o = JSON.parse(raw);
    prompt = o.prompt || o.user_prompt || o.message || raw;
  } catch { prompt = raw; }

  const wantsOpus  = /\bopus\b/i.test(prompt);
  const wantsFable = /\bfable\b/i.test(prompt);
  const delegating = /\b(sub-?agent|agent|review|verify|validate|check|evaluate|investigate|second opinion)\b/i.test(prompt);

  if (!(delegating && (wantsOpus || wantsFable))) return process.exit(0);

  const lines = ['The user explicitly asked for a different model. Do NOT do this work on the main thread.'];
  if (wantsOpus) {
    lines.push('- Opus: call Agent with subagent_type "opus-verifier" (model is pinned to opus in its definition).');
  }
  if (wantsFable) {
    lines.push('- Fable: call Agent with subagent_type "fable-reviewer" (model is pinned to fable in its definition).');
  }
  lines.push('If you use a different subagent_type instead, you MUST pass model: "' + (wantsOpus ? 'opus' : 'fable') + '" explicitly — a plain Agent call silently inherits Sonnet.');
  lines.push('Hand the subagent the full context it needs; it starts cold. Report what it found, including where it disagreed with you.');

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: lines.join('\n')
    }
  }));
});
