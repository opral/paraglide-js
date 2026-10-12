#!/usr/bin/env python3
"""Rebuild the read-only LocalAI i18n inventory from a pinned checkout.

Usage:
  python3 inventory.py /path/to/LocalAI [--out evidence.json]

This reads source and locale JSON only; it does not install dependencies or
modify the LocalAI checkout.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Any


SOURCE_FILES = [
    "core/http/react-ui/src/i18n/index.js",
    "core/http/react-ui/src/main.jsx",
    "core/http/react-ui/src/router.jsx",
    "core/http/react-ui/src/App.jsx",
    "core/http/react-ui/src/pages/Login.jsx",
    "core/http/react-ui/src/components/LoadingSpinner.jsx",
    "core/http/react-ui/src/components/RouteFallback.jsx",
    "core/http/react-ui/src/components/RequireAuth.jsx",
    "core/http/react-ui/src/components/RequireAuthEnabled.jsx",
    "core/http/react-ui/src/contexts/ThemeContext.jsx",
    "core/http/react-ui/src/contexts/BrandingContext.jsx",
    "core/http/react-ui/src/contexts/OperationsContext.jsx",
    "core/http/react-ui/src/context/AuthContext.jsx",
    "core/http/react-ui/src/utils/api.js",
    "core/http/react-ui/src/utils/basePath.js",
    "core/http/app.go",
    "core/http/react-ui/package.json",
    "core/http/react-ui/package-lock.json",
]

RETURN_OBJECTS_PATHS = {
    "biometrics.voice.why": ("biometrics", ["voice", "why"]),
    "biometrics.voice.stored": ("biometrics", ["voice", "stored"]),
    "biometrics.face.why": ("biometrics", ["face", "why"]),
    "biometrics.face.stored": ("biometrics", ["face", "stored"]),
    "chat.empty.suggestionsChat": ("chat", ["empty", "suggestionsChat"]),
    "chat.empty.suggestionsManage": ("chat", ["empty", "suggestionsManage"]),
    "media.studio.starters.images": ("media", ["studio", "starters", "images"]),
    "media.studio.starters.video": ("media", ["studio", "starters", "video"]),
    "media.studio.starters.tts": ("media", ["studio", "starters", "tts"]),
    "media.studio.starters.sound": ("media", ["studio", "starters", "sound"]),
    "media.studio.starters.threed": ("media", ["studio", "starters", "threed"]),
    "media.studio.starters.transform": ("media", ["studio", "starters", "transform"]),
    "media.studio.starters.diarization": ("media", ["studio", "starters", "diarization"]),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_value(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()


def walk_shape(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return {
            "kind": "object",
            "keys": list(value.keys()),
            "children": {key: walk_shape(child) for key, child in value.items()},
        }
    if isinstance(value, list):
        return {
            "kind": "array",
            "length": len(value),
            "items": [walk_shape(child) for child in value],
        }
    return {"kind": "string" if isinstance(value, str) else type(value).__name__}


def count_leaves(value: Any) -> tuple[int, int, int]:
    """Return primitive leaf, array-node, object-node counts."""
    if isinstance(value, dict):
        leaves = arrays = objects = 0
        for child in value.values():
            a, b, c = count_leaves(child)
            leaves += a
            arrays += b
            objects += c
        return leaves, arrays, objects + 1
    if isinstance(value, list):
        leaves = arrays = objects = 0
        for child in value:
            a, b, c = count_leaves(child)
            leaves += a
            arrays += b
            objects += c
        return leaves, arrays + 1, objects
    return 1, 0, 0


def count_plural_suffix_keys(value: Any) -> dict[str, int]:
    suffixes = {"zero": 0, "one": 0, "two": 0, "few": 0, "many": 0, "other": 0}
    if isinstance(value, dict):
        for key, child in value.items():
            if "_" in key and key.rsplit("_", 1)[1] in suffixes:
                suffixes[key.rsplit("_", 1)[1]] += 1
            nested = count_plural_suffix_keys(child)
            for suffix, count in nested.items():
                suffixes[suffix] += count
    elif isinstance(value, list):
        for child in value:
            nested = count_plural_suffix_keys(child)
            for suffix, count in nested.items():
                suffixes[suffix] += count
    return suffixes


def extract_names(text: str, export_name: str) -> list[str]:
    start = text.index(f"export const {export_name} = [")
    end = text.index("]", start)
    block = text[start:end]
    if export_name == "SUPPORTED_LANGUAGES":
        return re.findall(r"\{\s*code:\s*'([^']+)'", block)
    return re.findall(r"'([^']+)'", block.split("= [", 1)[1])


def get_path(value: Any, parts: list[str]) -> tuple[bool, Any]:
    for part in parts:
        if not isinstance(value, dict) or part not in value:
            return False, None
        value = value[part]
    return True, value


def source_matches(root: Path, files: list[str]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {"translationHooks": [], "returnObjects": [], "templateKeyExpressions": []}
    patterns = {
        "translationHooks": re.compile(r"useTranslation\s*\("),
        "returnObjects": re.compile(r"returnObjects\s*:\s*true"),
        "templateKeyExpressions": re.compile(r"\bt\s*\(\s*`[^`]*\$\{"),
    }
    for rel in files:
        path = root / rel
        if not path.exists() or path.suffix not in {".js", ".jsx", ".ts", ".tsx"}:
            continue
        for line_number, line in enumerate(path.read_text().splitlines(), 1):
            for category, pattern in patterns.items():
                if pattern.search(line):
                    out[category].append({"file": rel, "line": line_number, "source": line.strip()})
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_root", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    root = args.source_root.resolve()
    app = root / "core/http/react-ui"
    i18n_rel = "core/http/react-ui/src/i18n/index.js"
    i18n_text = (root / i18n_rel).read_text()
    declared_ns = extract_names(i18n_text, "NAMESPACES")
    supported = extract_names(i18n_text, "SUPPORTED_LANGUAGES")
    locale_root = app / "public/locales"

    locale_rows: dict[str, Any] = {}
    union_namespaces: set[str] = set()
    total_bytes = 0
    all_locale_files = sorted(locale_root.glob("*/*.json"))
    for path in all_locale_files:
        locale = path.parent.name
        namespace = path.stem
        raw = path.read_bytes()
        data = json.loads(raw)
        leaves, arrays, objects = count_leaves(data)
        row = locale_rows.setdefault(locale, {"files": [], "jsonBytes": 0, "primitiveLeaves": 0, "arrayNodes": 0, "objectNodes": 0, "pluralSuffixKeys": {"zero": 0, "one": 0, "two": 0, "few": 0, "many": 0, "other": 0}})
        row["files"].append({
            "namespace": namespace,
            "path": str(path.relative_to(root)),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "primitiveLeaves": leaves,
            "arrayNodes": arrays,
            "objectNodes": objects,
        })
        row["jsonBytes"] += len(raw)
        row["primitiveLeaves"] += leaves
        row["arrayNodes"] += arrays
        row["objectNodes"] += objects
        for suffix, count in count_plural_suffix_keys(data).items():
            row["pluralSuffixKeys"][suffix] += count
        union_namespaces.add(namespace)
        total_bytes += len(raw)

    for row in locale_rows.values():
        row["namespaceNames"] = [item["namespace"] for item in row["files"]]
        row["fileCount"] = len(row["files"])

    return_shapes: dict[str, Any] = {}
    for label, (namespace, parts) in RETURN_OBJECTS_PATHS.items():
        per_locale: dict[str, Any] = {}
        for locale in supported:
            path = locale_root / locale / f"{namespace}.json"
            if not path.exists():
                exists, value = False, None
            else:
                data = json.loads(path.read_text())
                exists, value = get_path(data, parts)
            effective_locale = locale
            effective_value = value
            effective_exists = exists
            if not exists and locale != "en":
                fallback_path = locale_root / "en" / f"{namespace}.json"
                if fallback_path.exists():
                    fallback_data = json.loads(fallback_path.read_text())
                    fallback_exists, fallback_value = get_path(fallback_data, parts)
                    if fallback_exists:
                        effective_locale, effective_value = "en", fallback_value
                        effective_exists = True
            per_locale[locale] = {
                "filePresent": path.exists(),
                "rawLocaleValuePresent": exists,
                "rawLocaleShape": walk_shape(value) if exists else None,
                "resolvedLocale": effective_locale if effective_exists else None,
                "resolvedShapeWithEnglishFallback": walk_shape(effective_value) if effective_exists else None,
            }
        return_shapes[label] = per_locale

    relevant_source = list(SOURCE_FILES)
    scan_paths = [
        str(path.relative_to(root))
        for path in sorted((app / "src").rglob("*"))
        if path.is_file()
        and path.suffix in {".js", ".jsx", ".ts", ".tsx"}
        and ".test." not in path.name
        and ".spec." not in path.name
        and "__tests__" not in path.parts
    ]
    scans = source_matches(root, scan_paths)
    scanned_files = {item["file"] for items in scans.values() for item in items}
    source_hashes = {
        rel: sha256(root / rel)
        for rel in sorted(set(relevant_source) | scanned_files)
        if (root / rel).is_file()
    }
    manifest = json.loads((app / "package-lock.json").read_text())
    locked_packages = manifest.get("packages", {})
    package_versions = {
        name: locked_packages.get(f"node_modules/{name}", {}).get("version")
        for name in ["vite", "i18next", "react-i18next", "i18next-http-backend", "i18next-browser-languagedetector", "react", "react-dom"]
    }
    package_versions = {name: version for name, version in package_versions.items() if version}

    result = {
        "schemaVersion": 1,
        "source": {
            "repository": "mudler/LocalAI",
            "commit": git_value(root, "rev-parse", "HEAD"),
            "appDirectory": "core/http/react-ui",
            "packageVersionsFromLock": package_versions,
            "hashes": source_hashes,
        },
        "methodology": {
            "localeFiles": "All checked-in public/locales/<language>/*.json files; one file per language and filename stem namespace.",
            "primitiveLeaves": "Recursive JSON traversal: each string/number/boolean/null counts as one leaf; object and array containers do not.",
            "rawBytes": "UTF-8 byte length of the checked-in JSON file without compression.",
            "pluralSuffixKeys": "Lexical object-key suffix counts for keys ending in _zero/_one/_two/_few/_many/_other; this is a dictionary inventory, not a complete i18next plural-call analysis.",
            "namespaceConstant": "Extracted from exported NAMESPACES array in src/i18n/index.js; compared as names, not treated as a file manifest.",
            "sourceHashes": "SHA-256 of the named integration/source files, all files with scanned translation-hook or key-expression matches, and every locale JSON file.",
        },
        "i18nConfig": {
            "supportedLocales": supported,
            "declaredNamespaces": declared_ns,
            "initialNamespaces": ["common", "nav", "errors"],
            "defaultNamespace": "common",
            "fallbackLanguage": "en",
            "backendLoadPath": "/locales/{{lng}}/{{ns}}.json via apiUrl()",
            "languageDetectorOrder": ["localStorage", "navigator", "htmlTag"],
            "languageDetectorLocalStorageKey": "localai-language",
            "suspense": True,
        },
        "catalog": {
            "totalFiles": len(all_locale_files),
            "totalRawJsonBytes": total_bytes,
            "declaredNamespacesCount": len(declared_ns),
            "filenameNamespaceUnion": sorted(union_namespaces),
            "filenameNamespaceUnionCount": len(union_namespaces),
            "declaredButNoFilename": sorted(set(declared_ns) - union_namespaces),
            "filenameButNotDeclared": sorted(union_namespaces - set(declared_ns)),
            "perLocale": locale_rows,
        },
        "returnObjectsShapes": return_shapes,
        "sourceScan": scans,
        "startupRouteAudit": {
            "route": "/login and /invite/:code",
            "routeComponent": "lazy Login page; Login calls useTranslation('auth')",
            "initNamespaces": ["common", "nav", "errors"],
            "sharedBoundary": "main.jsx wraps the app in Suspense with BootFallback; BootFallback only renders LoadingSpinner, whose accessible label is hard-coded 'Loading'.",
            "providers": {
                "ThemeProvider": "theme state only; no translation hooks",
                "BrandingProvider": "public branding API and document title/favicon; no translation hooks",
                "AuthProvider": "auth status fetch/state; no translation hooks",
                "OperationsProvider": "operations API/poller gated by isAdmin; no translation hooks; it is gated off for auth-enabled unauthenticated login, while no-auth mode can start it briefly before Login redirects to /app",
            },
            "notRenderedForLogin": ["App", "Sidebar", "ToastContainer", "App useTranslation('nav')", "ToastItem useTranslation('common')"],
            "errorSemantics": "Do not discard the i18next initialization and backend error paths or providers' existing auth/API behavior when defining a candidate; BootFallback is the current suspense UI.",
            "nativeControlProposal": "Keep every catalog, fallback, detector, backend, provider, and auth/error path. For an /login or /invite route, native i18next can optionally call loadNamespaces('auth') as soon as initialization is available, in parallel with existing initial namespaces and Login's lazy chunk; compare against existing lazy useTranslation('auth') and retain all load failures/fallback semantics. This is a route preload control, not key pruning.",
        },
    }

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    else:
        print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
