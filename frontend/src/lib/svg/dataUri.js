/**
 * SVG → Data URI converter.
 * Returns both base64 and URL-encoded variants.
 */

export function toDataUriBase64(svgString) {
  if (!svgString?.trim()) return "";
  try {
    const b64 = btoa(unescape(encodeURIComponent(svgString.trim())));
    return `data:image/svg+xml;base64,${b64}`;
  } catch {
    return "";
  }
}

export function toDataUriEncoded(svgString) {
  if (!svgString?.trim()) return "";
  try {
    const encoded = svgString
      .trim()
      .replace(/"/g, "'")
      .replace(/\s+/g, " ")
      .replace(/</g, "%3C")
      .replace(/>/g, "%3E")
      .replace(/#/g, "%23")
      .replace(/&/g, "%26");
    return `data:image/svg+xml,${encoded}`;
  } catch {
    return "";
  }
}

export function toDataUri(svgString) {
  return {
    base64: toDataUriBase64(svgString),
    encoded: toDataUriEncoded(svgString),
  };
}
