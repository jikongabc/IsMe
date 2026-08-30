import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ADMIN_ROUTES_ROOT = path.join(process.cwd(), "src/app/api/admin");
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type MutationHandler = {
  body: ts.Block;
  method: string;
  parameterName: string | null;
};

function routeFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(absolute);
    return entry.name === "route.ts" ? [absolute] : [];
  });
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function parameterName(parameters: ts.NodeArray<ts.ParameterDeclaration>): string | null {
  const first = parameters[0];
  return first && ts.isIdentifier(first.name) ? first.name.text : null;
}

function mutationHandlers(sourceFile: ts.SourceFile): MutationHandler[] {
  const handlers: MutationHandler[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      isExported(statement) &&
      statement.name &&
      MUTATION_METHODS.has(statement.name.text) &&
      statement.body
    ) {
      handlers.push({
        body: statement.body,
        method: statement.name.text,
        parameterName: parameterName(statement.parameters),
      });
      continue;
    }

    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !MUTATION_METHODS.has(declaration.name.text)) continue;
      const initializer = declaration.initializer;
      if (!initializer || (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) || !ts.isBlock(initializer.body)) {
        continue;
      }
      handlers.push({
        body: initializer.body,
        method: declaration.name.text,
        parameterName: parameterName(initializer.parameters),
      });
    }
  }

  return handlers;
}

function returnedIdentifier(statement: ts.Statement | undefined): string | null {
  if (!statement) return null;
  const returnStatement = ts.isBlock(statement) ? statement.statements[0] : statement;
  return ts.isReturnStatement(returnStatement) && returnStatement.expression && ts.isIdentifier(returnStatement.expression)
    ? returnStatement.expression.text
    : null;
}

function guardPairError(
  handler: MutationHandler,
  expectedGuard: string,
  offset: number,
): string | null {
  if (!handler.parameterName) return "request parameter must be an identifier";

  const declarationStatement = handler.body.statements[offset];
  if (!declarationStatement || !ts.isVariableStatement(declarationStatement)) {
    return `${expectedGuard} must be the first executable statement`;
  }
  const declarations = declarationStatement.declarationList.declarations;
  if (declarations.length !== 1 || !ts.isIdentifier(declarations[0].name) || !declarations[0].initializer) {
    return "guard result must be assigned to one identifier";
  }

  const resultName = declarations[0].name.text;
  const rawInitializer = declarations[0].initializer;
  const initializer = ts.isAwaitExpression(rawInitializer) ? rawInitializer.expression : rawInitializer;
  if (!ts.isCallExpression(initializer) || !ts.isIdentifier(initializer.expression) || initializer.expression.text !== expectedGuard) {
    return `first statement must call ${expectedGuard}`;
  }
  if (initializer.arguments.length !== 1 || !ts.isIdentifier(initializer.arguments[0]) || initializer.arguments[0].text !== handler.parameterName) {
    return `${expectedGuard} must receive the route request`;
  }

  const denialStatement = handler.body.statements[offset + 1];
  if (
    !denialStatement ||
    !ts.isIfStatement(denialStatement) ||
    !ts.isIdentifier(denialStatement.expression) ||
    denialStatement.expression.text !== resultName ||
    returnedIdentifier(denialStatement.thenStatement) !== resultName
  ) {
    return "guard denial must be returned immediately";
  }
  return null;
}

function leadingGuardError(handler: MutationHandler, expectedGuard: string): string | null {
  const firstGuard = guardPairError(handler, expectedGuard, 0);
  if (!firstGuard || expectedGuard === "requireSameOrigin") return firstGuard;

  const originGuard = guardPairError(handler, "requireSameOrigin", 0);
  if (originGuard) return firstGuard;
  return guardPairError(handler, expectedGuard, 2);
}

describe("admin mutation route guard contract", () => {
  it("starts every mutation with an enforced origin/auth guard", () => {
    const violations: string[] = [];
    let mutationCount = 0;

    for (const filename of routeFiles(ADMIN_ROUTES_ROOT)) {
      const sourceFile = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
      for (const handler of mutationHandlers(sourceFile)) {
        mutationCount += 1;
        const relative = path.relative(process.cwd(), filename);
        const expectedGuard = relative.endsWith("/login/route.ts") ? "requireSameOrigin" : "requireAdmin";
        const error = leadingGuardError(handler, expectedGuard);
        if (error) violations.push(`${relative} ${handler.method}: ${error}`);
      }
    }

    expect(mutationCount).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it("detects an unguarded exported mutation", () => {
    const sourceFile = ts.createSourceFile(
      "route.ts",
      "export async function POST(request: Request) { return Response.json({ ok: true }); }",
      ts.ScriptTarget.Latest,
      true,
    );
    const [handler] = mutationHandlers(sourceFile);

    expect(leadingGuardError(handler, "requireAdmin")).toBe("requireAdmin must be the first executable statement");
  });
});
