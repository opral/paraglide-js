import i18n,{t} from "./index.js";
import {EventType} from "@/types/search";
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

export default i18n;
