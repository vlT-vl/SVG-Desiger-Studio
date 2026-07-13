/**
 * SVG → React Native SVG converter.
 * Maps SVG elements to react-native-svg PascalCase components.
 */

import { normalizeSvgAttr } from "./attrs.js";

const RN_ELEMENT_MAP = {
  svg: "Svg",
  circle: "Circle",
  clippath: "ClipPath",
  defs: "Defs",
  desc: "Desc",
  ellipse: "Ellipse",
  feblend: "FeBlend",
  fecolormatrix: "FeColorMatrix",
  fecomponenttransfer: "FeComponentTransfer",
  fecomposite: "FeComposite",
  feconvolvematrix: "FeConvolveMatrix",
  fediffuselighting: "FeDiffuseLighting",
  fedisplacementmap: "FeDisplacementMap",
  fedistantlight: "FeDistantLight",
  feflood: "FeFlood",
  fefunca: "FeFuncA",
  fefuncb: "FeFuncB",
  fefuncg: "FeFuncG",
  fefuncr: "FeFuncR",
  fegaussianblur: "FeGaussianBlur",
  feimage: "FeImage",
  femerge: "FeMerge",
  femergenode: "FeMergeNode",
  femorphology: "FeMorphology",
  feoffset: "FeOffset",
  fepointlight: "FePointLight",
  fespecularlighting: "FeSpecularLighting",
  fespotlight: "FeSpotLight",
  fetile: "FeTile",
  feturbulence: "FeTurbulence",
  filter: "Filter",
  foreignobject: "ForeignObject",
  g: "G",
  image: "Image",
  line: "Line",
  lineargradient: "LinearGradient",
  marker: "Marker",
  mask: "Mask",
  path: "Path",
  pattern: "Pattern",
  polygon: "Polygon",
  polyline: "Polyline",
  radialgradient: "RadialGradient",
  rect: "Rect",
  stop: "Stop",
  symbol: "Symbol",
  text: "Text",
  textpath: "TextPath",
  title: "Title",
  tspan: "Tspan",
  use: "Use",
};

const REMOVE_ATTRS_RN = new Set(["xmlns", "xmlns:xlink", "xml:space"]);

function collectUsedComponents(doc) {
  const used = new Set();
  doc.querySelectorAll("*").forEach((el) => {
    const rnName = RN_ELEMENT_MAP[el.tagName.toLowerCase()];
    if (rnName) used.add(rnName);
  });
  return used;
}

function nodeToRN(node, indent, isRoot = false) {
  const pad = "  ".repeat(indent);

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim();
    return text ? `${pad}{${JSON.stringify(text)}}\n` : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const rnTag = RN_ELEMENT_MAP[node.tagName.toLowerCase()] || node.tagName;

  const attrs = [];
  Array.from(node.attributes).forEach((attr) => {
    if (REMOVE_ATTRS_RN.has(attr.name)) return;

    let name = attr.name;
    let value = normalizeSvgAttr(name, attr.value);

    // camelCase hyphenated attrs (reuse the same map logic as toReact)
    const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    if (name === "style") {
      // Keep style as object
      const obj = value.split(";").reduce((acc, part) => {
        const idx = part.indexOf(":");
        if (idx < 0) return acc;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k && v) acc[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
        return acc;
      }, {});
      const objStr = Object.entries(obj).map(([k, v]) => `${k}: "${v}"`).join(", ");
      attrs.push(`style={{ ${objStr} }}`);
      return;
    }

    const num = parseFloat(value);
    if (!isNaN(num) && String(num) === value.trim()) {
      attrs.push(`${camel}={${num}}`);
    } else {
      attrs.push(`${camel}="${value}"`);
    }
  });

  if (isRoot) attrs.push("{...props}");

  const children = Array.from(node.childNodes)
    .map((c) => nodeToRN(c, indent + 1))
    .join("");

  const attrStr = attrs.length === 0 ? "" : attrs.length <= 2
    ? " " + attrs.join(" ")
    : "\n" + attrs.map((a) => `${pad}  ${a}`).join("\n") + "\n" + pad;

  if (!children.trim()) {
    return `${pad}<${rnTag}${attrStr}/>\n`;
  }

  return `${pad}<${rnTag}${attrStr}>\n${children}${pad}</${rnTag}>\n`;
}

export function toReactNative(svgString) {
  if (!svgString?.trim()) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString.trim(), "image/svg+xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) return `// SVG parse error\n${svgString}`;

    const used = collectUsedComponents(doc);
    used.delete("Svg");

    const importComponents = used.size > 0
      ? `import Svg, { ${Array.from(used).sort().join(", ")} } from "react-native-svg";`
      : `import Svg from "react-native-svg";`;

    const svg = doc.documentElement;
    const inner = nodeToRN(svg, 1, true).trimEnd();

    return [
      `import * as React from "react";`,
      importComponents,
      ``,
      `const SvgComponent = (props) => (`,
      inner,
      `);`,
      ``,
      `export default SvgComponent;`,
    ].join("\n");
  } catch (e) {
    return `// Conversion error: ${e.message}`;
  }
}
