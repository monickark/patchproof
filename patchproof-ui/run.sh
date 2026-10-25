#!/bin/sh
set -eu
cd "$(dirname "$0")"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] || ! "$NODE_BIN" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' 2>/dev/null; then
 NODE_BIN="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [ ! -x "$NODE_BIN" ]; then echo 'Install Node.js 24 or newer.' >&2; exit 1; fi
(cd ../patchproof && "$NODE_BIN" build.mjs)
cp ../patchproof/dist/classify-instance.mjs dist/classify-instance.mjs
exec "$NODE_BIN" server.mjs "$@"
