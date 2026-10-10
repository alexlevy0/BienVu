import {readFile, readdir} from 'node:fs/promises';
import {resolve, relative, dirname} from 'node:path';
import {builtinModules} from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const failures = [];
const modules = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
const forbidden = /^(?:@remotion\/(?:renderer|bundler|compositor[^/]*)|remotion|sharp|fluent-ffmpeg|ffmpeg[^/]*|puppeteer[^/]*|playwright(?:-core)?|@bienvu\/(?:renderer|video))(?:\/|$)/;
const roots = ['apps/web', 'apps/mail', 'apps/pipeline', 'packages/contracts', 'packages/db', 'packages/importers', 'packages/observability', 'packages/voice', 'packages/narration', 'packages/maps', 'packages/avatars'];
const portable = ['packages/contracts', 'packages/db', 'packages/importers', 'packages/observability', 'packages/voice', 'packages/narration', 'packages/maps', 'packages/avatars'];
const skip = new Set(['node_modules', '.next', '.open-next', '.wrangler', 'dist', 'out', 'evidence']);
const options = {moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022, allowJs: true};
let count = 0;
async function inspectFile(path, scope) {
  const text = await readFile(path, 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      if (node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
      else failures.push(`${relative(root, path)} : chargement dynamique non analysable`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source); count++;
  for (const name of imports) {
    if (forbidden.test(name) || scope === 'apps/web' && name.startsWith('@cloudflare/playwright')) failures.push(`${relative(root, path)} : runtime de rendu/navigateur interdit (${name})`);
    if (portable.includes(scope) && modules.has(name)) failures.push(`${relative(root, path)} : API Node interdite (${name})`);
    if (name.startsWith('.') || name.startsWith('@/')) {
      const target = ts.resolveModuleName(name, path, options, ts.sys).resolvedModule?.resolvedFileName ?? resolve(dirname(path), name);
      if (/(?:apps\/(?:renderer|importer)|packages\/video)\//.test(relative(root, target))) failures.push(`${relative(root, path)} : traverse la frontière Node/Workers`);
      if (/^scripts\/(?:import-transport|import-browser-transport|import-photo-preview|serve-imports|import-fixtures)\./.test(relative(root, target))) failures.push(`${relative(root, path)} : importe le transport Node local dans un Worker`);
    }
  }
}
async function walk(path, scope) {
  // Generated browser worker files come from the pinned, independently bundled SDK.
  if (relative(root,path) === 'apps/web/public/maplibre') return;
  for (const entry of await readdir(path, {withFileTypes: true})) {
    if (skip.has(entry.name)) continue;
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) await walk(full, scope);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) await inspectFile(full, scope);
  }
}
for (const scope of roots) {
  await walk(resolve(root, scope), scope);
  const pkg = JSON.parse(await readFile(resolve(root, scope, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(pkg.dependencies ?? {}))
    if (forbidden.test(dependency)) failures.push(`${scope}/package.json : dépendance de rendu interdite (${dependency})`);
}
if (failures.length) {console.error(failures.join('\n')); process.exitCode = 1;}
else console.log(`Frontières vérifiées : ${count} fichiers, renderer et composition isolés des Workers, contrats sans API Node.`);
