#!/bin/sh
# Prefer a compatible Node on PATH; fall back to Codex's bundled runtime.
set -eu
cd "$(dirname "$0")"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] || ! "$NODE_BIN" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' 2>/dev/null; then
  NODE_BIN="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [ ! -x "$NODE_BIN" ]; then
  echo 'Install Node.js 24 or newer to run PatchProof.' >&2
  exit 1
fi
"$NODE_BIN" build.mjs
case "${1:-demo}" in
  demo) exec "$NODE_BIN" demo/run.mjs ;;
  test) exec "$NODE_BIN" --test test/patchproof.test.mjs ;;
  *) exec "$NODE_BIN" dist/cli.mjs "$@" ;;
esac
