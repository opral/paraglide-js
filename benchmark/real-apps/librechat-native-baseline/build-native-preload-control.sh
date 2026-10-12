#!/usr/bin/env bash
set -euo pipefail

source_root=${LIBRECHAT_SOURCE:?Set LIBRECHAT_SOURCE to a clean pinned LibreChat checkout}
archive_root=$(cd "$(dirname "$0")" && pwd)
node_bin=${NODE_BIN:-node}
npm_bin=${NPM_BIN:-npm}
expected_commit=e1dfc10449ff713faffacd60273fddcfe2c0a698

node_path=$(command -v "$node_bin")
export PATH="$(dirname "$node_path"):$PATH"
actual_commit=$(git -C "$source_root" rev-parse HEAD)
actual_node=$("$node_bin" --version)
actual_npm=$("$npm_bin" --version)
if [[ "$actual_commit" != "$expected_commit" ]]; then
  printf 'Expected LibreChat commit %s, got %s\n' "$expected_commit" "$actual_commit" >&2
  exit 1
fi
if [[ "$actual_node" != v24.16.0 || "$actual_npm" != 11.13.0 ]]; then
  printf 'Expected Node v24.16.0/npm 11.13.0, got %s/%s\n' "$actual_node" "$actual_npm" >&2
  exit 1
fi

if [[ -e "$source_root/client/benchmark-native-locale-preload.ts" ]]; then
  printf 'Refusing to overwrite existing benchmark-native-locale-preload.ts\n' >&2
  exit 1
fi
cp "$archive_root/native-locale-preload-control.ts" "$source_root/client/benchmark-native-locale-preload.ts"
git -C "$source_root" apply --check "$archive_root/native-preload-config.patch"
git -C "$source_root" apply "$archive_root/native-preload-config.patch"

printf 'Source commit: %s\nNode: %s\nnpm: %s\n' "$actual_commit" "$actual_node" "$actual_npm"
(
  cd "$source_root"
  "$npm_bin" ci
  LIBRECHAT_BENCHMARK_NATIVE_LOCALE_PRELOAD=1 "$npm_bin" run frontend
)
