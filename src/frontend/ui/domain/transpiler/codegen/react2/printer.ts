import * as ts from "typescript";

export function printAST(sourceFile: ts.SourceFile): string {
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });

  return printer.printNode(ts.EmitHint.SourceFile, sourceFile, sourceFile);
}
