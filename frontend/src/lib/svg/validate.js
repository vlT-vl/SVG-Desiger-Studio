export function validateSvgSyntax(svgCode) {
  if (!svgCode?.trim()) return null;

  const doc = new DOMParser().parseFromString(svgCode, "image/svg+xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    const message = cleanParserMessage(parserError.textContent || "Invalid SVG syntax");
    const location = parseParserLocation(message);
    return {
      type: "syntax",
      message,
      line: location.line,
      column: location.column,
      offset: location.line ? offsetFromLineColumn(svgCode, location.line, location.column ?? 1) : 0,
    };
  }

  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    return {
      type: "root",
      message: "Missing root <svg> element",
      line: firstContentLine(svgCode),
      column: 1,
      offset: 0,
    };
  }

  return null;
}

function cleanParserMessage(message) {
  return message
    .replace(/\s+/g, " ")
    .replace(/^This page contains the following errors?:?\s*/i, "")
    .replace(/Below is a rendering of the page up to the first error\.?/i, "")
    .trim();
}

function parseParserLocation(message) {
  const lineColumn = message.match(/line\s+(\d+)[^\d]+column\s+(\d+)/i);
  if (lineColumn) {
    return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
  }

  const lineOnly = message.match(/line\s+(\d+)/i);
  if (lineOnly) {
    return { line: Number(lineOnly[1]), column: null };
  }

  return { line: null, column: null };
}

function offsetFromLineColumn(code, line, column) {
  const targetLine = Math.max(1, line);
  const targetColumn = Math.max(1, column);
  let currentLine = 1;
  let offset = 0;

  while (offset < code.length && currentLine < targetLine) {
    if (code[offset] === "\n") currentLine++;
    offset++;
  }

  return Math.min(code.length, offset + targetColumn - 1);
}

function firstContentLine(code) {
  const idx = code.search(/\S/);
  if (idx < 0) return 1;
  return (code.slice(0, idx).match(/\n/g) || []).length + 1;
}
