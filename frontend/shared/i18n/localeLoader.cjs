// Build-time step for the message files (next.config.mjs, production builds).
//
// A feature's copy file keeps all five languages side by side in one record,
// which is how the copy is written and kept in step. Imported whole, every page
// carried four languages its reader never sees inside the English bundle. Here
// each language file (en.ts, fr.ts, ...) imports its feature files with
// `?only=<its language>`, and that copy of the feature file keeps only that
// language's entry; the others become undefined and the minifier drops them.
// Development and the tests read the files exactly as written.
const ts = require('typescript');

const LOCALES = ['en', 'ar', 'fr', 'hi', 'sw'];
const LOCALE_FILE = /[\\/]messages[\\/](en|ar|fr|hi|sw)\.ts$/;
const NOT_FEATURES = new Set(['./en', './ar', './fr', './hi', './sw', './index', './all']);

function parse(source) {
  return ts.createSourceFile('copy.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function apply(source, edits) {
  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/// A language file asks for its own language from each feature file.
function pointImportsAtLocale(source, locale) {
  const edits = [];
  for (const st of parse(source).statements) {
    if (!ts.isImportDeclaration(st) || st.importClause?.isTypeOnly) continue;
    const spec = st.moduleSpecifier;
    if (!ts.isStringLiteral(spec) || !/^\.\/[A-Za-z]+$/.test(spec.text) || NOT_FEATURES.has(spec.text)) continue;
    edits.push({ start: spec.getStart() + 1, end: spec.getEnd() - 1, text: `${spec.text}?only=${locale}` });
  }
  return apply(source, edits);
}

function localeUnion(type) {
  if (!type || !ts.isTypeReferenceNode(type) || type.typeName.getText() !== 'Record') return false;
  const keys = type.typeArguments?.[0];
  if (keys && ts.isTypeReferenceNode(keys) && keys.typeName.getText() === 'Locale') return true;
  if (!keys || !ts.isUnionTypeNode(keys)) return false;
  return keys.types.every((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal) && LOCALES.includes(t.literal.text));
}

/// The exported language records in a file: each entry's language and the
/// text of its value (the name, for `{ en, fr }`).
function languageRecords(source) {
  const records = [];
  for (const st of parse(source).statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of st.declarationList.declarations) {
      if (!localeUnion(decl.type) || !decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;
      records.push(decl.initializer.properties.flatMap((p) => {
        const name = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
        if (!LOCALES.includes(name)) return [];
        if (ts.isShorthandPropertyAssignment(p)) return [{ locale: name, node: p, value: name, shorthand: true }];
        if (ts.isPropertyAssignment(p)) return [{ locale: name, node: p, value: p.initializer.getText(), shorthand: false }];
        return [];
      }));
    }
  }
  return records;
}

/// Keeps one language in every exported language record. Returns the source
/// unchanged, and `found` 0, when the file has no such record.
function stripToLocale(source, locale) {
  const edits = [];
  let found = 0;
  for (const entries of languageRecords(source)) {
    if (!entries.some((e) => e.locale === locale)) continue;
    found += 1;
    for (const e of entries) {
      if (e.locale === locale) continue;
      if (e.shorthand) edits.push({ start: e.node.getStart(), end: e.node.getEnd(), text: `${e.locale}: undefined` });
      else edits.push({ start: e.node.initializer.getStart(), end: e.node.initializer.getEnd(), text: 'undefined' });
    }
  }
  return { source: apply(source, edits), found };
}

module.exports = function localeLoader(source) {
  const locale = LOCALE_FILE.exec(this.resourcePath)?.[1];
  if (locale) return pointImportsAtLocale(source, locale);
  const only = new URLSearchParams((this.resourceQuery || '').replace(/^\?/, '')).get('only');
  if (!only || !LOCALES.includes(only)) return source;
  const stripped = stripToLocale(source, only);
  if (!stripped.found) this.emitWarning(new Error(`${this.resourcePath}: no language record to keep ${only} in`));
  return stripped.source;
};
module.exports.pointImportsAtLocale = pointImportsAtLocale;
module.exports.stripToLocale = stripToLocale;
module.exports.languageRecords = (source) => languageRecords(source).map((entries) => entries.map(({ locale, value }) => ({ locale, value })));
module.exports.LOCALES = LOCALES;
