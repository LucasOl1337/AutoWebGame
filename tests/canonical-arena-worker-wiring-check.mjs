import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const path = new URL("../worker/index.js", import.meta.url);
const sourceText = await readFile(path, "utf8");
const source = ts.createSourceFile(path.pathname, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

let importsContract = false;
let catalogRoutedViaGlobalLobby = false;
let directRouteDispatchesContract = false;
let directRouteSupportsHead = false;
let revisionedAssetsAreImmutable = false;

function visit(node) {
  if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === "../src/Arenas/canonical-arena-worker") {
    importsContract = node.importClause?.namedBindings?.elements.some(
      (element) => element.name.text === "createCanonicalArenaCatalogResponse",
    ) ?? false;
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "PUBLIC_API_ROUTES" && ts.isNewExpression(node.initializer)) {
    const entries = node.initializer.arguments?.[0];
    if (entries && ts.isArrayLiteralExpression(entries)) {
      for (const entry of entries.elements) {
        if (!ts.isArrayLiteralExpression(entry) || entry.elements.length < 2) continue;
        const [route] = entry.elements;
        if (!ts.isStringLiteral(route) || route.text !== "/api/arena/catalog/cidadela-arcana/r1") continue;
        catalogRoutedViaGlobalLobby = true;
      }
    }
  }
  if (ts.isIfStatement(node) && node.expression.getText(source).includes('url.pathname === "/api/arena/catalog/cidadela-arcana/r1"')) {
    directRouteSupportsHead = node.thenStatement.getText(source).includes('request.method !== "HEAD"')
      && node.thenStatement.getText(source).includes('request.method === "HEAD"');
    let delegates = false;
    function inspect(child) {
      if (ts.isCallExpression(child) && child.expression.getText(source) === "createCanonicalArenaCatalogResponse") {
        const argumentsText = child.arguments.map((argument) => argument.getText(source)).join(",");
        delegates = argumentsText.includes('"cidadela-arcana","r1"')
          && argumentsText.includes('request.headers.get("if-none-match")');
      }
      ts.forEachChild(child, inspect);
    }
    inspect(node.thenStatement);
    directRouteDispatchesContract = delegates;
  }
  if (
    ts.isIfStatement(node)
    && node.expression.getText(source).includes('pathname.startsWith("/Assets/TileMaps/canonical/")')
  ) {
    revisionedAssetsAreImmutable = node.thenStatement.getText(source).includes("IMMUTABLE_STATIC_CACHE_CONTROL");
  }
  ts.forEachChild(node, visit);
}
visit(source);

assert.equal(importsContract, true);
assert.equal(catalogRoutedViaGlobalLobby, false);
assert.equal(directRouteDispatchesContract, true);
assert.equal(directRouteSupportsHead, true);
assert.equal(revisionedAssetsAreImmutable, true);

console.log(JSON.stringify({
  pass: true,
  importsContract,
  catalogRoutedViaGlobalLobby,
  directRouteDispatchesContract,
  directRouteSupportsHead,
  revisionedAssetsAreImmutable,
}, null, 2));
