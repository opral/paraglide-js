import i18n, { t, type Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import { EventType } from "@/types/search";
import { loadLocale } from "@/paraglide/locale-loader.js";
import { getLocale } from "@/paraglide/runtime.js";
import { m as paraglideMessages } from "@/paraglide/messages.js";
import routeMessageMap from "./paraglide-project.inlang/route-message-map.json";

type TranslationTree = { [key: string]: string | TranslationTree };
type RouteMessage = (typeof routeMessageMap)[number];
type CompiledMessage = (
  inputs?: Record<string, unknown>,
  options?: { locale?: string },
) => string;

const compiledMessageById = paraglideMessages as unknown as Record<
  string,
  CompiledMessage
>;

function setNestedTranslation(
  target: TranslationTree,
  path: string[],
  value: string,
) {
  let current = target;
  for (const part of path.slice(0, -1)) {
    const child = current[part];
    if (typeof child !== "object" || child === null) {
      current[part] = {};
    }
    current = current[part] as TranslationTree;
  }
  current[path[path.length - 1]!] = value;
}

function getCompiledRouteResources(locales: string[]): Resource {
  const resources: Resource = {};
  for (const locale of locales) {
    const namespaces: Record<string, TranslationTree> = {};
    for (const entry of routeMessageMap as RouteMessage[]) {
      const message = compiledMessageById[entry.id];
      if (typeof message !== "function") {
        throw new Error(`Missing generated Paraglide message ${entry.id}`);
      }
      const text = message({}, { locale }).replace(
        /__PG_I18NEXT_VAR_([A-Za-z0-9_.-]+)__/g,
        "{{$1}}",
      );
      const namespace = (namespaces[entry.namespace] ??= {});
      setNestedTranslation(namespace, entry.path, text);
    }
    resources[locale] = namespaces;
  }
  return resources;
}

const startupLocale = getLocale();
await Promise.all(
  [...new Set(["en", startupLocale])].map((locale) => loadLocale(locale)),
);
const routeResources = getCompiledRouteResources(["en", startupLocale]);

export const getTranslatedLabel = (
  label: string,
  type: EventType = "object",
) => {
  if (!label) return "";

  if (type === "manual") return label;

  const normalize = (s: string) =>
    s
      .trim()
      .replace(/[-'\s]+/g, "_")
      .replace(/__+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();

  const key = normalize(label);

  const ns = type === "audio" ? "audio" : "objects";

  return t(key, { ns });
};

i18n
  .use(initReactI18next)
  .use(HttpBackend)
  .init({
    lng: startupLocale,
    fallbackLng: "en", // use en if detected lng is not available
    resources: routeResources,

    backend: {
      loadPath: `locales/{{lng}}/{{ns}}.json?v=${import.meta.env.VITE_GIT_COMMIT_HASH || "unknown"}`,
    },

    ns: ["objects", "audio"],
    defaultNS: "common",

    react: {
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: [
        "br",
        "strong",
        "i",
        "em",
        "li",
        "p",
        "code",
        "span",
        "p",
        "ul",
        "li",
        "ol",
      ],
    },
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    keySeparator: ".",
    parseMissingKeyHandler: (key: string) => {
      const parts = key.split(".");

      if (parts[0] === "time" && parts[1]?.includes("formattedTimestamp")) {
        // Extract the format type from the last part (12hour, 24hour)
        const formatType = parts[parts.length - 1];

        // Return actual date-fns format strings as fallbacks
        const formatDefaults: Record<string, string> = {
          "12hour": "h:mm aaa",
          "24hour": "HH:mm",
        };

        if (formatDefaults[formatType]) {
          return formatDefaults[formatType];
        }
      }

      // Handle special cases for objects and audio
      if (parts[0] === "object" || parts[0] === "audio") {
        return (
          parts[1]
            ?.split("_")
            .map(
              (word) =>
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
            )
            .join(" ") || key
        );
      }

      // For nested keys, try to make them more readable
      if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        return lastPart
          .split("_")
          .map(
            (word) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
          )
          .join(" ");
      }

      // For single keys, just smart-capitalize and format
      return key
        .split("_")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(" ");
    },
  });

export default i18n;
