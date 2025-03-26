// src/compiler.ts - Integration with burn compiler
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { execSync } from 'child_process';

export class BurnCompiler {
  constructor(private compilerPath: string) {}

  public checkSyntax(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    try {
      // Create a temporary file with the current content
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `burn-check-${Date.now().toString()}.bn`);
      fs.writeFileSync(tempFile, document.getText());

      try {
        // Run the compiler with debug mode to get more information
        execSync(`${this.compilerPath} -d "${tempFile}"`, { stdio: 'pipe' });
      } catch (error) {
        if (error instanceof Error && 'stderr' in error) {
          const errorOutput = (error as { stderr: Buffer }).stderr.toString();

          // Parse errors from the output
          // Sample format: lexical error at line 10, column 5: unexpected character '{'
          const errorRegex =
            /(lexical|syntax|type|runtime) error at line (\d+), column (\d+): (.+)/g;
          let match;

          while ((match = errorRegex.exec(errorOutput)) !== null) {
            const [, errorType, lineStr, colStr, message] = match;
            const line = parseInt(lineStr, 10) - 1; // Convert to 0-based
            const col = parseInt(colStr, 10) - 1; // Convert to 0-based

            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line, character: col },
                end: { line, character: col + 1 },
              },
              message,
              source: `burn-${errorType}`,
            });
          }
        }
      } finally {
        // Clean up the temporary file
        fs.unlinkSync(tempFile);
      }
    } catch (error) {
      console.error('Error running compiler check:', error);
    }

    return diagnostics;
  }
}
