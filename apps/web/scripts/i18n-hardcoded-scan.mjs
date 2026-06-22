// AST-based detector for user-visible hardcoded UI strings in the web app.
//
// It parses each .tsx file (TypeScript compiler API) and flags:
//   - JSX text nodes that contain real words (not just brand/tech tokens);
//   - string-literal values for user-facing attributes
//     (placeholder, title, aria-label, alt);
//   - raw string/template literals passed to toast.*(), confirm(), alert().
//
// It intentionally does NOT flag: translation keys (`t('...')`), className /
// style / role / data-* attributes, enum values, imports, or anything inside a
// JSX expression container (e.g. `{t('x')}`, `{variable}`).
//
// Escape hatch: append `// i18n-ignore` on the same line to justify and silence
// a specific finding (used only for product names / technical tokens).
//
// Usage:  node scripts/i18n-hardcoded-scan.mjs        (prints findings, exits 1 if any)
//         import { scanHardcoded } from './i18n-hardcoded-scan.mjs'  (for tests)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(HERE, '..');
const SRC = join(WEB_ROOT, 'src');

const SCAN_DIRS = ['pages', 'components', 'layouts'];

// Long-form legal/policy prose (Terms, Privacy, …) is canonical English pending
// professional legal review before public launch; localizing it is a separate,
// review-gated workstream (documented in FULL_SITE_I18N_REPORT.md), so it is not
// scanned for hardcoded strings here.
const EXCLUDE_PATHS = ['pages/legal/'];

// User-facing attributes whose plain string values are real UI copy.
const TEXT_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt']);

// Call targets whose string arguments are user-visible messages.
const MESSAGE_CALLS = new Set([
  'toast.success',
  'toast.danger',
  'toast.error',
  'toast.info',
  'toast.warning',
  'confirm',
  'window.confirm',
  'alert',
  'window.alert',
  'prompt',
  'window.prompt',
]);

// Brand and technical tokens that are allowed to appear verbatim in the UI.
const ALLOW_WORDS = [
  'VibePlay',
  'NeoFlux',
  'Creator Plus',
  'Fat Dima Simulator',
  'Discord',
  'GitHub',
  'Google',
  'OAuth',
  'ZIP',
  'HTML5',
  'HTML',
  'WebGL',
  'WebGL2',
  'SDK',
  'API',
  'GA4',
  'URL',
  'CSS',
  'JSON',
  'CDN',
  'MinIO',
  'ClamAV',
  'CSP',
  'UUID',
  'ID',
];

const IGNORE_MARKER = 'i18n-ignore';

/** Residual real-word text after removing brand/tech tokens and non-letters. */
function meaningfulText(raw) {
  let text = ` ${raw} `;
  // Drop HTML entities (&copy; &gt; &amp; …) so they don't read as words.
  text = text.replace(/&[a-zA-Z]+;/g, ' ');
  for (const word of ALLOW_WORDS) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g'), ' ');
  }
  // Keep Latin + Cyrillic letters only; a real string has a 2+ letter word.
  const hasWord = /[A-Za-zЀ-ӿ]{2,}/.test(text);
  return hasWord ? raw.trim() : '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function literalFromExpression(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((s) => s.literal.text).join(' ');
  }
  return null;
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    return `${calleeName(expr.expression)}.${expr.name.text}`;
  }
  return '';
}

/**
 * Scan the web `src` tree and return an array of findings.
 * @returns {Array<{file:string,line:number,kind:string,text:string}>}
 */
export function scanHardcoded({ root = SRC } = {}) {
  const files = [];
  for (const dir of SCAN_DIRS) collectTsx(join(root, dir), files);
  const scanned = files.filter(
    (file) => !EXCLUDE_PATHS.some((ex) => relative(root, file).split('\\').join('/').includes(ex)),
  );

  const findings = [];
  for (const file of scanned) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const lineHasIgnore = (pos) => {
      const { line } = sf.getLineAndCharacterOfPosition(pos);
      return (lines[line] ?? '').includes(IGNORE_MARKER);
    };
    const add = (pos, kind, text) => {
      if (lineHasIgnore(pos)) return;
      const { line } = sf.getLineAndCharacterOfPosition(pos);
      findings.push({ file: relative(root, file), line: line + 1, kind, text });
    };

    const visit = (node) => {
      if (ts.isJsxText(node)) {
        const text = meaningfulText(node.text);
        if (text) add(node.getStart(sf), 'jsx-text', text);
      } else if (ts.isJsxAttribute(node) && node.initializer) {
        const name = node.name.getText(sf);
        if (TEXT_ATTRS.has(name)) {
          const init = node.initializer;
          const literal = ts.isJsxExpression(init)
            ? literalFromExpression(init.expression)
            : literalFromExpression(init);
          if (literal !== null) {
            const text = meaningfulText(literal);
            if (text) add(node.getStart(sf), `attr:${name}`, text);
          }
        }
      } else if (ts.isCallExpression(node)) {
        const name = calleeName(node.expression);
        if (MESSAGE_CALLS.has(name) && node.arguments.length > 0) {
          const literal = literalFromExpression(node.arguments[0]);
          if (literal !== null) {
            const text = meaningfulText(literal);
            if (text) add(node.getStart(sf), `call:${name}`, text);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return findings;
}

function collectTsx(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsx(full, out);
    } else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
}

/** Stable identity of a finding, ignoring line number (which shifts on edits). */
export function findingKey(f) {
  return `${f.file}|${f.kind}|${f.text}`;
}

// CLI entry: print findings (or JSON with --json) and exit non-zero when any remain.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const findings = scanHardcoded();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(findings, null, 2));
    process.exit(0);
  }
  if (findings.length === 0) {
    console.log('i18n scan: no hardcoded UI strings found.');
    process.exit(0);
  }
  console.error(`i18n scan: ${findings.length} hardcoded UI string(s) found:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.kind}]  ${JSON.stringify(f.text)}`);
  }
  console.error('\nReplace with t(...) keys, or add `// i18n-ignore` to justify an exception.');
  process.exit(1);
}
