#!/usr/bin/env node
// PostToolUse hook (Write|Edit). Deterministic, zero-model-call verification of
// the file that was just edited.
//   mode "go" : gofmt -l + go vet on the containing package. Fast, synchronous.
//               Reports via additionalContext.
//   mode "ts" : tsc --noEmit against the nearest tsconfig. Slow, so it is wired
//               up with asyncRewake — exit 2 wakes the model only on real errors.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const mode = process.argv[2];
let raw = '';
process.stdin.on('data', d => (raw += d));
process.stdin.on('end', () => {
  let file = '';
  try {
    const o = JSON.parse(raw);
    file = (o.tool_response && o.tool_response.filePath) || (o.tool_input && o.tool_input.file_path) || '';
  } catch { return process.exit(0); }
  if (!file || !fs.existsSync(file)) return process.exit(0);

  const sh = (cmd, cwd) => {
    try {
      return { ok: true, out: execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }) };
    } catch (e) {
      return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
    }
  };
  const emit = txt => process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: txt }
  }));

  // walk up for a marker file
  const findUp = (start, names) => {
    let d = path.dirname(start);
    for (let i = 0; i < 12; i++) {
      for (const n of names) if (fs.existsSync(path.join(d, n))) return d;
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
    return null;
  };

  if (mode === 'go') {
    if (!file.endsWith('.go')) return process.exit(0);
    const env = { ...process.env, PATH: process.env.PATH + ':/usr/local/go/bin:' + (process.env.HOME || '') + '/go/bin' };
    process.env.PATH = env.PATH;
    const root = findUp(file, ['go.mod']);
    if (!root) return process.exit(0);
    const msgs = [];
    const fmt = sh(`gofmt -l ${JSON.stringify(file)}`, root);
    if (fmt.ok && fmt.out.trim()) msgs.push(`gofmt: ${path.relative(root, file)} is not gofmt'd. Run: gofmt -w ${path.relative(root, file)}`);
    const pkgDir = path.dirname(file);
    const vet = sh(`go vet ./${path.relative(root, pkgDir) || '.'}`, root);
    if (!vet.ok && vet.out.trim()) msgs.push(`go vet failed for ./${path.relative(root, pkgDir)}:\n${vet.out.trim().slice(0, 2000)}`);
    if (msgs.length) emit('Automatic post-edit check found problems:\n\n' + msgs.join('\n\n'));
    return process.exit(0);
  }

  if (mode === 'ts') {
    if (!/\.(ts|tsx|mts|cts)$/.test(file)) return process.exit(0);
    const root = findUp(file, ['tsconfig.json']);
    if (!root) return process.exit(0);
    const tsc = path.join(root, 'node_modules', '.bin', 'tsc');
    if (!fs.existsSync(tsc)) return process.exit(0);
    const r = sh(`${JSON.stringify(tsc)} --noEmit`, root);
    if (!r.ok && r.out.trim()) {
      process.stderr.write(`tsc --noEmit failed in ${root} after editing ${path.basename(file)}:\n${r.out.trim().slice(0, 3000)}\n`);
      return process.exit(2); // asyncRewake: wake the model, type errors are real
    }
    return process.exit(0);
  }
  process.exit(0);
});
