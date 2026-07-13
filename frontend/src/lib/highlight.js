import { findTagEnd } from "./svg/tagScanner.js";

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sp(cls, raw) {
  return `<span class="hl-${cls}">${escHtml(raw)}</span>`;
}

// ── SVG / XML ─────────────────────────────────────────────────────────────────

function hlXmlAttrStr(tag, i) {
  const q = tag[i];
  const end = tag.indexOf(q, i + 1);
  const j = end < 0 ? tag.length : end + 1;
  return { html: sp('s', tag.slice(i, j)), end: j };
}

function hlXmlTag(tag) {
  const cM = tag.match(/^<\/([^\s>]+)\s*>$/);
  if (cM) {
    return `<span class="hl-b">&lt;/</span>${sp('t', cM[1])}<span class="hl-b">&gt;</span>`;
  }
  if (/^<[!?]/.test(tag)) return sp('c', tag);

  let out = '';
  let i = 1;

  const nmM = tag.slice(i).match(/^([\w:.-]+)/);
  if (!nmM) return escHtml(tag);
  out += `<span class="hl-b">&lt;</span>${sp('t', nmM[1])}`;
  i += nmM[1].length;

  while (i < tag.length) {
    const ch = tag[i];
    if (ch === '>') { out += `<span class="hl-b">&gt;</span>`; break; }
    if (tag.slice(i) === '/>') { out += `<span class="hl-b">/&gt;</span>`; break; }
    if (ch === '/') { out += escHtml(ch); i++; continue; }

    const wsM = tag.slice(i).match(/^(\s+)/);
    if (wsM) { out += wsM[1]; i += wsM[1].length; continue; }

    const atM = tag.slice(i).match(/^([\w:.-]+)/);
    if (!atM) { out += escHtml(ch); i++; continue; }
    out += sp('a', atM[1]);
    i += atM[1].length;

    if (tag[i] === '=') {
      out += `<span class="hl-b">=</span>`;
      i++;
      if (tag[i] === '"' || tag[i] === "'") {
        const r = hlXmlAttrStr(tag, i);
        out += r.html;
        i = r.end;
      }
    }
  }

  return out;
}

export function highlightSvg(code) {
  if (!code) return '';
  let out = '';
  let i = 0;

  while (i < code.length) {
    if (code.startsWith('<!--', i)) {
      const end = code.indexOf('-->', i + 4);
      const j = end < 0 ? code.length : end + 3;
      out += sp('c', code.slice(i, j));
      i = j; continue;
    }
    if (code.startsWith('<![CDATA[', i)) {
      const end = code.indexOf(']]>', i + 9);
      const j = end < 0 ? code.length : end + 3;
      out += sp('s', code.slice(i, j));
      i = j; continue;
    }
    if (code[i] === '<') {
      const end = findTagEnd(code, i);
      if (end < 0) { out += escHtml('<'); i++; continue; }
      out += hlXmlTag(code.slice(i, end));
      i = end; continue;
    }
    let j = i;
    while (j < code.length && code[j] !== '<') j++;
    out += escHtml(code.slice(i, j));
    i = j;
  }

  return out;
}

// ── JSX / JS ──────────────────────────────────────────────────────────────────

const KW = new Set([
  'import', 'export', 'from', 'as', 'default',
  'const', 'let', 'var', 'function', 'class', 'new', 'this', 'super',
  'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
  'continue', 'try', 'catch', 'finally', 'throw',
  'typeof', 'instanceof', 'void', 'delete', 'in', 'of',
  'async', 'await', 'yield',
  'null', 'undefined', 'true', 'false',
]);

function hlJsxTag(tag) {
  if (tag === '<>' || tag === '</>') {
    return `<span class="hl-b">${escHtml(tag)}</span>`;
  }
  const cM = tag.match(/^<\/([^\s>]+)\s*>$/);
  if (cM) {
    const nm = cM[1];
    return `<span class="hl-b">&lt;/</span>${sp(/^[A-Z]/.test(nm) ? 'tc' : 't', nm)}<span class="hl-b">&gt;</span>`;
  }
  if (/^<[!?]/.test(tag)) return sp('c', tag);

  let out = '';
  let i = 1;

  const nmM = tag.slice(i).match(/^([\w.$]+)/);
  if (!nmM) return escHtml(tag);
  out += `<span class="hl-b">&lt;</span>${sp(/^[A-Z]/.test(nmM[1]) ? 'tc' : 't', nmM[1])}`;
  i += nmM[1].length;

  while (i < tag.length) {
    const ch = tag[i];
    if (ch === '>') { out += `<span class="hl-b">&gt;</span>`; break; }
    if (tag.slice(i) === '/>') { out += `<span class="hl-b">/&gt;</span>`; break; }
    if (ch === '/') { out += escHtml(ch); i++; continue; }

    const wsM = tag.slice(i).match(/^(\s+)/);
    if (wsM) { out += wsM[1]; i += wsM[1].length; continue; }

    if (ch === '{') {
      let d = 1, j = i + 1;
      while (j < tag.length && d > 0) {
        if (tag[j] === '{') d++;
        else if (tag[j] === '}') d--;
        j++;
      }
      out += `<span class="hl-p">${escHtml(tag.slice(i, j))}</span>`;
      i = j; continue;
    }

    const atM = tag.slice(i).match(/^([\w:.-]+)/);
    if (!atM) { out += escHtml(ch); i++; continue; }
    out += sp('a', atM[1]);
    i += atM[1].length;

    if (tag[i] === '=') {
      out += `<span class="hl-b">=</span>`;
      i++;
      if (tag[i] === '"' || tag[i] === "'") {
        const r = hlXmlAttrStr(tag, i);
        out += r.html; i = r.end;
      } else if (tag[i] === '{') {
        let d = 1, j = i + 1;
        while (j < tag.length && d > 0) {
          if (tag[j] === '{') d++;
          else if (tag[j] === '}') d--;
          j++;
        }
        out += `<span class="hl-p">${escHtml(tag.slice(i, j))}</span>`;
        i = j;
      }
    }
  }

  return out;
}

export function highlightJsx(code) {
  if (!code) return '';
  let out = '';
  let i = 0;

  while (i < code.length) {
    // line comment
    if (code.startsWith('//', i)) {
      const j = code.indexOf('\n', i);
      const end = j < 0 ? code.length : j;
      out += sp('c', code.slice(i, end));
      i = end; continue;
    }
    // block comment
    if (code.startsWith('/*', i)) {
      const j = code.indexOf('*/', i + 2);
      const end = j < 0 ? code.length : j + 2;
      out += sp('c', code.slice(i, end));
      i = end; continue;
    }
    // template literal
    if (code[i] === '`') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === '`') { j++; break; }
        j++;
      }
      out += sp('s', code.slice(i, j));
      i = j; continue;
    }
    // string
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i];
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === q || code[j] === '\n') { if (code[j] === q) j++; break; }
        j++;
      }
      out += sp('s', code.slice(i, j));
      i = j; continue;
    }
    // JSX tag
    if (code[i] === '<') {
      const next = code[i + 1] ?? '';
      if (/[A-Za-z_$\/]/.test(next) || next === '>') {
        let j = i + 1, q = null, d = 0;
        while (j < code.length) {
          const c = code[j];
          if (q) { if (c === q && code[j - 1] !== '\\') q = null; }
          else if (c === '"' || c === "'") q = c;
          else if (c === '{') d++;
          else if (c === '}') d--;
          else if (c === '>' && d === 0) { j++; break; }
          j++;
        }
        out += hlJsxTag(code.slice(i, j));
        i = j; continue;
      }
    }
    // number
    if (/[0-9]/.test(code[i]) && !/[a-zA-Z_$.]/.test(code[i - 1] ?? '')) {
      const numM = code.slice(i).match(/^(0x[\da-fA-F]+|\d+\.?\d*([eE][+-]?\d+)?)/);
      if (numM) { out += sp('n', numM[1]); i += numM[1].length; continue; }
    }
    // identifier / keyword
    if (/[a-zA-Z_$]/.test(code[i])) {
      const idM = code.slice(i).match(/^([a-zA-Z_$][\w$]*)/);
      if (idM) {
        const word = idM[1];
        if (KW.has(word)) {
          out += sp('k', word);
        } else {
          const isFn = /^\s*\(/.test(code.slice(i + word.length));
          out += isFn ? sp('f', word) : escHtml(word);
        }
        i += word.length; continue;
      }
    }
    out += escHtml(code[i]);
    i++;
  }

  return out;
}
