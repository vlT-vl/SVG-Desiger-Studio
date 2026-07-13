export function normalizeSvgAttr(name, value) {
  if (value == null) return "";

  const attrName = name.toLowerCase();
  if (attrName === "d") return normalizePathData(value);
  if (attrName === "points") return normalizePoints(value);
  if (attrName === "style") return normalizeStyle(value);

  return value.replace(/\s+/g, " ").trim();
}

export function normalizePathData(value) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*([AaCcHhLlMmQqSsTtVvZz])\s*/g, "$1")
    .replace(/\s*,\s*/g, ",")
    .replace(/([0-9.])\s+(-)/g, "$1$2")
    .trim();
}

export function normalizePoints(value) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStyle(value) {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx < 0) return part;
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      return `${key}:${val}`;
    })
    .join(";");
}
