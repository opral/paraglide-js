#!/usr/bin/env bash
set -euo pipefail
root_dir=$(cd "$(dirname "$0")" && pwd)
node_bin=${NODE_BIN:-/root/.npm/_npx/387698761821791d/node_modules/node/bin/node}
export NODE_ENV=production NODE_OPTIONS=--max-old-space-size=8192
(
 cd "$root_dir/native-source/client"
 LIBRECHAT_BENCHMARK_NATIVE_LOCALE_PRELOAD=1 "$node_bin" ../node_modules/vite/bin/vite.js build > "$root_dir/native-build.log" 2>&1
)
(
 cd "$root_dir/client"
 "$node_bin" build-per-locale.mjs > "$root_dir/candidate-facades-build.log" 2>&1
)
"$node_bin" "$root_dir/verify-converter.mjs"
"$node_bin" "$root_dir/verify-facades.mjs"
"$node_bin" "$root_dir/verify-output.mjs"
"$node_bin" "$root_dir/verify-literals.mjs"
"$node_bin" "$root_dir/compress-q4.mjs" "$root_dir/native-source/client/dist-native" "$root_dir/client/dist-per-locale-facades"
"$node_bin" "$root_dir/graph.mjs"
