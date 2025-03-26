import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { connection, typeTracker } from './server';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { execSync } from 'child_process';
import { getDocumentSettings } from './settings';
import { getPathFromURI } from './utils';

export async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument.uri);
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  const syntaxDiagnostics = checkSyntax(textDocument, text);
  diagnostics.push(...syntaxDiagnostics);

  const typeDiagnostics =
    (typeTracker as { parseDocument: (doc: TextDocument) => Diagnostic[] | null }).parseDocument(
      textDocument
    ) ?? [];
  diagnostics.push(...typeDiagnostics);

  try {
    const compilerDiagnostics = validateWithCompiler(textDocument, settings.compilerPath);
    diagnostics.push(...compilerDiagnostics);
  } catch (error) {
    connection.console.log(
      `Error using compiler: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  void connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function checkSyntax(document: TextDocument, text: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  let braces = 0;
  let parentheses = 0;
  let brackets = 0;

  let lastOpenBrace = -1;
  let lastOpenParen = -1;
  let lastOpenBracket = -1;

  let inLineComment = false;

  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);

    if (char === '/' && text.charAt(i + 1) === '/') {
      inLineComment = true;
    }
    if (char === '\n' && inLineComment) {
      inLineComment = false;
    }
    if (inLineComment) {
      continue;
    }

    if (char === '{') {
      braces++;
      lastOpenBrace = i;
    } else if (char === '}') {
      braces--;
      if (braces < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(i),
            end: document.positionAt(i + 1),
          },
          message: `Unexpected closing brace '}'`,
          source: 'burn',
        });
        braces = 0;
      }
    } else if (char === '(') {
      parentheses++;
      lastOpenParen = i;
    } else if (char === ')') {
      parentheses--;
      if (parentheses < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(i),
            end: document.positionAt(i + 1),
          },
          message: `Unexpected closing parenthesis ')'`,
          source: 'burn',
        });
        parentheses = 0;
      }
    } else if (char === '[') {
      brackets++;
      lastOpenBracket = i;
    } else if (char === ']') {
      brackets--;
      if (brackets < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(i),
            end: document.positionAt(i + 1),
          },
          message: `Unexpected closing bracket ']'`,
          source: 'burn',
        });
        brackets = 0;
      }
    }
  }

  if (braces > 0 && lastOpenBrace >= 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.positionAt(lastOpenBrace),
        end: document.positionAt(lastOpenBrace + 1),
      },
      message: `Unclosed brace '{'`,
      source: 'burn',
    });
  }

  if (parentheses > 0 && lastOpenParen >= 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.positionAt(lastOpenParen),
        end: document.positionAt(lastOpenParen + 1),
      },
      message: `Unclosed parenthesis '('`,
      source: 'burn',
    });
  }

  if (brackets > 0 && lastOpenBracket >= 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.positionAt(lastOpenBracket),
        end: document.positionAt(lastOpenBracket + 1),
      },
      message: `Unclosed bracket '['`,
      source: 'burn',
    });
  }

  return diagnostics;
}

function validateWithCompiler(
  document: TextDocument,
  compilerPath: string | undefined
): Diagnostic[] {
  if (!compilerPath) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const filePath = getPathFromURI(document.uri);
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    execSync(`${compilerPath} --check "${filePath}"`, { stdio: 'pipe' });
  } catch (error) {
    if (error instanceof Error && 'stdout' in error) {
      const errorOutput = (error as { stdout: Buffer }).stdout.toString();
      const errorLines = errorOutput.split('\n');

      for (const line of errorLines) {
        const match = /([^:]+):(\d+):(\d+):\s+(error|warning):\s+(.+)/.exec(line);
        if (match) {
          const [, , lineStr, colStr, severity, message] = match;
          const lineNum = parseInt(lineStr, 10) - 1;
          const colNum = parseInt(colStr, 10) - 1;

          diagnostics.push({
            severity: severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
            range: {
              start: { line: lineNum, character: colNum },
              end: { line: lineNum, character: colNum + 1 },
            },
            message,
            source: 'burn-compiler',
          });
        }
      }
    }
  }

  return diagnostics;
}
