/**
 * SVG → React JSX converter.
 * Matches @svgr/core output style.
 */

import { normalizeSvgAttr } from "./attrs.js";

const ATTR_MAP = {
  "class": "className",
  "for": "htmlFor",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  "stroke-width": "strokeWidth",
  "stroke-opacity": "strokeOpacity",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-miterlimit": "strokeMiterlimit",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "clip-path": "clipPath",
  "clip-rule": "clipRule",
  "color-interpolation": "colorInterpolation",
  "color-interpolation-filters": "colorInterpolationFilters",
  "flood-color": "floodColor",
  "flood-opacity": "floodOpacity",
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-size-adjust": "fontSizeAdjust",
  "font-stretch": "fontStretch",
  "font-style": "fontStyle",
  "font-variant": "fontVariant",
  "font-weight": "fontWeight",
  "glyph-orientation-horizontal": "glyphOrientationHorizontal",
  "glyph-orientation-vertical": "glyphOrientationVertical",
  "image-rendering": "imageRendering",
  "letter-spacing": "letterSpacing",
  "lighting-color": "lightingColor",
  "marker-end": "markerEnd",
  "marker-mid": "markerMid",
  "marker-start": "markerStart",
  "overline-position": "overlinePosition",
  "overline-thickness": "overlineThickness",
  "paint-order": "paintOrder",
  "pointer-events": "pointerEvents",
  "shape-rendering": "shapeRendering",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "strikethrough-position": "strikethroughPosition",
  "strikethrough-thickness": "strikethroughThickness",
  "stroke": "stroke",
  "text-anchor": "textAnchor",
  "text-decoration": "textDecoration",
  "text-rendering": "textRendering",
  "underline-position": "underlinePosition",
  "underline-thickness": "underlineThickness",
  "unicode-bidi": "unicodeBidi",
  "vector-effect": "vectorEffect",
  "word-spacing": "wordSpacing",
  "writing-mode": "writingMode",
  "xlink:href": "href",
  "xlink:title": "xlinkTitle",
  "xml:lang": "xmlLang",
  "xml:space": "xmlSpace",
  "xmlns:xlink": null,
  "tabindex": "tabIndex",
};

const NUMERIC_ATTRS = new Set([
  "cx", "cy", "dx", "dy", "height", "k1", "k2", "k3", "k4",
  "markerHeight", "markerWidth", "numOctaves", "offset", "opacity",
  "pathLength", "points", "r", "radius", "rx", "ry",
  "seedValue", "slope", "stdDeviation", "stemh", "stemv",
  "stopOpacity", "strikethroughPosition", "strikethroughThickness",
  "surfaceScale", "tabIndex", "underlinePosition", "underlineThickness",
  "version", "viewBox", "width", "widths", "x", "x1", "x2", "xHeight",
  "y", "y1", "y2", "z",
  "fillOpacity", "strokeOpacity", "strokeWidth", "strokeMiterlimit",
  "fontWeight", "fontSize",
]);

function styleStringToObject(styleStr) {
  const obj = {};
  styleStr.split(";").forEach((part) => {
    const idx = part.indexOf(":");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key || !val) return;
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    obj[camel] = val;
  });
  return obj;
}

function attrToJsx(name, value) {
  const mapped = ATTR_MAP[name];
  if (mapped === null) return null;
  const jsxName = mapped ?? name;
  const normalizedValue = normalizeSvgAttr(name, value);

  if (name === "style") {
    const obj = styleStringToObject(normalizedValue);
    const objStr = Object.entries(obj)
      .map(([k, v]) => `${k}: "${v}"`)
      .join(", ");
    return `style={{ ${objStr} }}`;
  }

  const numName = mapped ?? name;
  if (NUMERIC_ATTRS.has(numName)) {
    const num = parseFloat(normalizedValue);
    if (!isNaN(num) && String(num) === normalizedValue.trim()) {
      return `${jsxName}={${num}}`;
    }
  }

  return `${jsxName}="${normalizedValue}"`;
}

function nodeToJsx(node, indent, isRoot = false) {
  const pad = "  ".repeat(indent);

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim();
    return text ? `${pad}${text}\n` : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName;

  const attrs = [];
  Array.from(node.attributes).forEach((attr) => {
    if (attr.name === "xmlns" && isRoot) return;
    if (attr.name === "xmlns:xlink") return;
    const jsx = attrToJsx(attr.name, attr.value);
    if (jsx !== null) attrs.push(jsx);
  });

  if (isRoot) attrs.push("{...props}");

  const children = Array.from(node.childNodes)
    .map((c) => nodeToJsx(c, indent + 1))
    .join("");

  const attrLines = attrs.length === 0 ? "" : attrs.length <= 2
    ? " " + attrs.join(" ")
    : "\n" + attrs.map((a) => `${pad}  ${a}`).join("\n") + "\n" + pad;

  if (!children.trim()) {
    return `${pad}<${tag}${attrLines}/>\n`;
  }

  return `${pad}<${tag}${attrLines}>\n${children}${pad}</${tag}>\n`;
}

export function toReact(svgString) {
  if (!svgString?.trim()) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString.trim(), "image/svg+xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) return `// SVG parse error\n${svgString}`;

    const svg = doc.documentElement;
    const inner = nodeToJsx(svg, 1, true).trimEnd();

    return [
      `import * as React from "react";`,
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
