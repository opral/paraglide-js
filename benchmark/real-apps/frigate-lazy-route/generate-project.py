#!/usr/bin/env python3
"""Build a pinned Paraglide input project from Frigate's checked-in catalogs."""

import json
import os
import re
from pathlib import Path

archive = Path(__file__).resolve().parent
web = Path(os.environ["FRIGATE_WEB_ROOT"]).resolve()
locale_root = web / "public" / "locales"
settings_source = (web / "src" / "lib" / "const.ts").read_text()
locale_block = settings_source.split("export const supportedLanguageKeys = [", 1)[1].split("] as const", 1)[0]
locales = re.findall(r'"([^\"]+)"', locale_block)
namespaces = [
    "common",
    "objects",
    "audio",
    "components/camera",
    "components/dialog",
    "components/player",
    "views/live",
    "views/settings",
    "views/system",
]

placeholder_re = re.compile(r"\{\{\s*-?\s*([A-Za-z0-9_.-]+)\s*\}\}")


def flatten(node, prefix=()):
    rows = []
    if isinstance(node, dict):
        for key, value in node.items():
            rows.extend(flatten(value, prefix + tuple(str(key).split("."))))
    elif isinstance(node, str):
        rows.append((prefix, node))
    return rows


def message_id(namespace, path):
    return json.dumps([namespace, list(path)], ensure_ascii=False, separators=(",", ":"))


def transform(text):
    return placeholder_re.sub(lambda match: f"__PG_I18NEXT_VAR_{match.group(1)}__", text)


message_rows = {}
base_message_ids = []
for locale in locales:
    messages = {}
    for namespace in namespaces:
        path = locale_root / locale / f"{namespace}.json"
        if not path.exists():
            raise SystemExit(f"missing supported catalog file: {path}")
        for keys, value in flatten(json.loads(path.read_text())):
            id_ = message_id(namespace, keys)
            if id_ in messages:
                raise SystemExit(f"duplicate generated message id: {id_}")
            messages[id_] = transform(value)
            message_rows[id_] = {"id": id_, "namespace": namespace, "path": list(keys)}
            if locale == "en":
                base_message_ids.append(id_)
    (archive / "messages").mkdir(exist_ok=True)
    (archive / "messages" / f"{locale}.json").write_text(
        json.dumps(messages, ensure_ascii=False, indent=2) + "\n"
    )

ordered_ids = base_message_ids + sorted(set(message_rows) - set(base_message_ids))
metadata = {
    "locales": locales,
    "namespaces": namespaces,
    "messageCount": len(base_message_ids),
    "messageIds": [message_rows[id_] for id_ in ordered_ids],
    "unionMessageCount": len(ordered_ids),
}
project = archive / "paraglide-project.inlang"
project.mkdir(exist_ok=True)
(project / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
(project / "route-message-map.json").write_text(
    json.dumps(metadata["messageIds"], ensure_ascii=False, indent=2) + "\n"
)
(project / "settings.json").write_text(
    json.dumps(
        {
            "$schema": "https://inlang.com/schema/project-settings",
            "baseLocale": "en",
            "locales": locales,
            "modules": [
                "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4.5.0/dist/index.js"
            ],
            "plugin.inlang.messageFormat": {"pathPattern": "./messages/{locale}.json"},
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)
print(json.dumps({"locales": len(locales), "namespaces": len(namespaces), "messageIds": len(ordered_ids)}, indent=2))
