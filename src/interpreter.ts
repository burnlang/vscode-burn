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
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `burn-check-${Date.now().toString()}.bn`);
      fs.writeFileSync(tempFile, document.getText());

      try {
        execSync(`${this.compilerPath} -d "${tempFile}"`, { stdio: 'pipe' });
      } catch (error) {
        if (error instanceof Error && 'stderr' in error) {
          const errorOutput = (error as { stderr: Buffer }).stderr.toString();

          this.parseCompilerErrors(errorOutput, diagnostics, document);
        }
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    } catch (error) {
      console.error('Error running compiler check:', error);
    }

    return diagnostics;
  }

  private parseCompilerErrors(
    errorOutput: string,
    diagnostics: Diagnostic[],
    document: TextDocument
  ): void {
    const errorRegex = /(lexical|syntax|type|runtime) error at line (\d+), column (\d+): (.+)/g;

    const tokenErrorRegex = /unexpected token '(.+)' at line (\d+), column (\d+)/g;
    const undefinedVarRegex = /undefined variable '(.+)' at line (\d+), column (\d+)/g;
    const typeErrorRegex =
      /type mismatch: expected '(.+)', got '(.+)' at line (\d+), column (\d+)/g;

    let match;
    while ((match = errorRegex.exec(errorOutput)) !== null) {
      const [, errorType, lineStr, colStr, message] = match;
      const line = parseInt(lineStr, 10) - 1;
      const col = parseInt(colStr, 10) - 1;

      const lineText = document.getText().split('\n')[line] || '';
      const errorLength = this.getErrorTokenLength(lineText, col);

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line, character: col },
          end: { line, character: col + errorLength },
        },
        message: `${errorType} error: ${message}`,
        source: 'burn-compiler',
      });
    }

    while ((match = tokenErrorRegex.exec(errorOutput)) !== null) {
      const [, token, lineStr, colStr] = match;
      const line = parseInt(lineStr, 10) - 1;
      const col = parseInt(colStr, 10) - 1;

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line, character: col },
          end: { line, character: col + token.length },
        },
        message: `Unexpected token '${token}'`,
        source: 'burn-syntax',
      });
    }

    while ((match = undefinedVarRegex.exec(errorOutput)) !== null) {
      const [, varName, lineStr, colStr] = match;
      const line = parseInt(lineStr, 10) - 1;
      const col = parseInt(colStr, 10) - 1;

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line, character: col },
          end: { line, character: col + varName.length },
        },
        message: `Undefined variable '${varName}'`,
        source: 'burn-semantics',
      });
    }

    while ((match = typeErrorRegex.exec(errorOutput)) !== null) {
      const [, expected, got, lineStr, colStr] = match;
      const line = parseInt(lineStr, 10) - 1;
      const col = parseInt(colStr, 10) - 1;

      const lineText = document.getText().split('\n')[line] || '';
      const errorLength = this.getExpressionLength(lineText, col);

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line, character: col },
          end: { line, character: col + errorLength },
        },
        message: `Type mismatch: expected '${expected}', got '${got}'`,
        source: 'burn-type',
      });
    }

    if (diagnostics.length === 0 && errorOutput.trim().length > 0) {
      const genericErrorMatch = /error:?\s+(.+)/i.exec(errorOutput);
      if (genericErrorMatch) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          message: genericErrorMatch[1].trim(),
          source: 'burn-compiler',
        });
      }
    }
  }

  private getErrorTokenLength(lineText: string, column: number): number {
    if (column >= lineText.length) {
      return 1;
    }

    let endCol = column;
    while (endCol < lineText.length && this.isIdentifierChar(lineText.charAt(endCol))) {
      endCol++;
    }

    return Math.max(1, endCol - column);
  }

  private isIdentifierChar(char: string): boolean {
    return /[a-zA-Z0-9_]/.test(char);
  }

  private getExpressionLength(lineText: string, column: number): number {
    if (column >= lineText.length) {
      return 1;
    }

    const slice = lineText.slice(column);
    const match = /^[a-zA-Z0-9_.()[\]{}]+/.exec(slice);
    if (match) {
      return match[0].length;
    }

    return 1;
  }

  public getEnvironmentInfo(): { version: string; compilerPath: string } {
    try {
      const versionOutput = execSync(`${this.compilerPath} -v`, { encoding: 'utf8' });
      const versionMatch = /v([0-9.]+)/.exec(versionOutput);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      return {
        version,
        compilerPath: this.compilerPath,
      };
    } catch (error) {
      console.error('Error getting Burn environment info:', error);
      return {
        version: 'unknown',
        compilerPath: this.compilerPath,
      };
    }
  }

  public isCompilerAvailable(): boolean {
    try {
      execSync(`${this.compilerPath} -v`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
