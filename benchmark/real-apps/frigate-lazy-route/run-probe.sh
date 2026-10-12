#!/usr/bin/env bash
set -euo pipefail

archive_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${FRIGATE_WEB_ROOT:-}" ]]; then
	 echo "Set FRIGATE_WEB_ROOT to web/ in the pinned Frigate checkout." >&2
	 exit 2
fi
if [[ -z "${PARAGLIDE_PLUGIN_ENTRY:-}" ]]; then
	 echo "Set PARAGLIDE_PLUGIN_ENTRY to the pinned compiler dist/index.js." >&2
	 exit 2
fi
web_root="$(cd "$FRIGATE_WEB_ROOT" && pwd)"
repo_root="$(cd "$web_root/.." && pwd)"
expected_source="ff9eb8f18430198548d9c9d2cf138ed9ac7b526b"
actual_source="$(git -C "$repo_root" rev-parse HEAD)"
if [[ "$actual_source" != "$expected_source" ]]; then
	 echo "Expected Frigate $expected_source, got $actual_source" >&2
	 exit 2
fi

export FRIGATE_WEB_ROOT="$web_root"
export PARAGLIDE_PLUGIN_ENTRY="$(realpath "$PARAGLIDE_PLUGIN_ENTRY")"
python3 "$archive_dir/generate-project.py"

mkdir -p "$web_root/.real-apps"
cp "$archive_dir/native-i18n.ts" "$web_root/.real-apps/native-i18n.ts"
cp "$archive_dir/candidate-i18n.ts" "$web_root/.real-apps/candidate-i18n.ts"
cp "$archive_dir/vite.native-es2022.config.ts" "$web_root/.real-apps/vite.native-es2022.config.ts"
cp "$archive_dir/vite.paraglide.config.ts" "$web_root/.real-apps/vite.paraglide.config.ts"
cp "$archive_dir/namespace-load-probe.spec.ts" "$web_root/e2e/specs/namespace-load-probe-archive.spec.ts"
rm -rf "$web_root/.real-apps/paraglide-project.inlang" "$web_root/.real-apps/messages"
cp -a "$archive_dir/paraglide-project.inlang" "$web_root/.real-apps/paraglide-project.inlang"
cp -a "$archive_dir/messages" "$web_root/.real-apps/messages"
cleanup() {
	 rm -f "$web_root/e2e/specs/namespace-load-probe-archive.spec.ts"
}
trap cleanup EXIT

cd "$web_root"
pnpm exec vite build --config .real-apps/vite.native-es2022.config.ts
NAMESPACE_GRAPH_OUTPUT="$archive_dir/results/native-es2022-route" \
	E2E_STRICT_ERRORS=1 pnpm exec playwright test \
	--config e2e/playwright.config.ts \
	--project=desktop e2e/specs/namespace-load-probe-archive.spec.ts

pnpm exec vite build --config .real-apps/vite.paraglide.config.ts
node "$archive_dir/inventory-check.mjs"
NAMESPACE_GRAPH_OUTPUT="$archive_dir/results/paraglide-tla-route" \
	E2E_STRICT_ERRORS=1 pnpm exec playwright test \
	--config e2e/playwright.config.ts \
	--project=desktop e2e/specs/namespace-load-probe-archive.spec.ts

echo "Artifacts written beneath $archive_dir/results"
