// ── Color detection ──────────────────────────────────────────────────────────

// Match longest patterns first to avoid partial matches
const COLOR_RES = [
  /(?:rgba?|hsla?)\s*\([^)]*\)/g,
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g,
];

export function getColorAtCursor(code, pos) {
  if (!code || pos == null) return null;

  const win   = 120;
  const lo    = Math.max(0, pos - win);
  const hi    = Math.min(code.length, pos + win);
  const slice = code.slice(lo, hi);
  const off   = pos - lo;

  for (const re of COLOR_RES) {
    re.lastIndex = 0;
    for (const m of slice.matchAll(re)) {
      const s = m.index;
      const e = s + m[0].length;
      if (s <= off && off <= e) {
        return { value: m[0], start: lo + s, end: lo + e };
      }
    }
  }
  return null;
}

// ── HSV ↔ RGB ────────────────────────────────────────────────────────────────

export function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;
  if      (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d   = max - min;
  let h = 0;
  if (d !== 0) {
    if      (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else                h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
}

// ── Color string → HSV ───────────────────────────────────────────────────────

export function parseColorToHsv(str) {
  if (!str) return null;
  str = str.trim();

  // Hex — expand shorthand (#rgb / #rgba → #rrggbb / #rrggbbaa)
  const hexM = str.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexM) {
    let h = hexM[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
    return rgbToHsv(
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    );
  }

  // rgb / rgba (integer values; percentage form not handled)
  const rgbM = str.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbM) return rgbToHsv(+rgbM[1], +rgbM[2], +rgbM[3]);

  // hsl / hsla
  const hslM = str.match(/^hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
  if (hslM) {
    const hh = +hslM[1];
    const sl = +hslM[2] / 100;
    const l  = +hslM[3] / 100;
    // HSL → HSV
    const vv = l + sl * Math.min(l, 1 - l);
    const sv = vv === 0 ? 0 : 2 * (1 - l / vv);
    return { h: hh, s: sv, v: vv };
  }

  return null;
}
