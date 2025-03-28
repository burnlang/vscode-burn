import * as fs from 'fs';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { ExecSyncOptionsWithStringEncoding, execSync } from 'child_process';
import { connection, typeTracker } from './server';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getDocumentSettings } from './settings';
import { getTempFilePath } from './utils';

const diagnosticsCache = new Map<string, { version: number; diagnostics: Diagnostic[] }>();

export async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument.uri);
  const text = textDocument.getText();

  const cacheKey = textDocument.uri;
  const cached = diagnosticsCache.get(cacheKey);
  if (cached && cached.version === textDocument.version) {
    void connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: cached.diagnostics });
    return;
  }

  const diagnostics: Diagnostic[] = [];

  const syntaxDiagnostics = checkSyntax(textDocument, text);
  const lintDiagnostics = lintDocument(textDocument, text);
  diagnostics.push(...syntaxDiagnostics, ...lintDiagnostics);

  const hasCriticalSyntaxErrors = syntaxDiagnostics.some(
    diag =>
      diag.severity === DiagnosticSeverity.Error &&
      (diag.message.includes('Unclosed') || diag.message.includes('Unexpected closing'))
  );

  if (!hasCriticalSyntaxErrors) {
    try {
      const typeDiagnostics =
        (
          typeTracker as { parseDocument: (doc: TextDocument) => Diagnostic[] | null }
        ).parseDocument(textDocument) ?? [];
      diagnostics.push(...typeDiagnostics);
    } catch (error) {
      connection.console.log(
        `Error in type checker: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const semanticDiagnostics = checkSemantics(textDocument, text);
    diagnostics.push(...semanticDiagnostics);

    try {
      if (settings.compilerPath && fs.existsSync(settings.compilerPath)) {
        const compilerDiagnostics = await validateWithCompiler(textDocument, settings.compilerPath);
        diagnostics.push(...compilerDiagnostics);
      }
    } catch (error) {
      connection.console.log(
        `Error using compiler: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  diagnosticsCache.set(cacheKey, {
    version: textDocument.version,
    diagnostics,
  });

  void connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

/**
 * Check basic syntax of the document
 */
function checkSyntax(document: TextDocument, text: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  let braces = 0;
  let parentheses = 0;
  let brackets = 0;

  const openBracePositions: number[] = [];
  const openParenPositions: number[] = [];
  const openBracketPositions: number[] = [];

  let inString = false;
  let stringStart = -1;
  let stringChar = '';

  let inLineComment = false;

  const keywords = new Set([
    'fun',
    'var',
    'const',
    'if',
    'else',
    'while',
    'for',
    'return',
    'import',
    'def',
    'class',
  ]);
  const declarationKeywords = new Set(['fun', 'var', 'const', 'def', 'class']);

  let i = 0;
  while (i < text.length) {
    const char = text.charAt(i);

    if (char === '/' && text.charAt(i + 1) === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      i++;
      continue;
    }

    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringStart = i;
      stringChar = char;
      i++;
      continue;
    }

    if (inString) {
      if (char === '\\') {
        i += 2;
        continue;
      }

      if (char === stringChar) {
        inString = false;
      } else if (char === '\n') {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(stringStart),
            end: document.positionAt(i),
          },
          message: `Unterminated string literal`,
          source: 'burn-syntax',
        });
        inString = false;
      }

      i++;
      continue;
    }

    if (char === '{') {
      braces++;
      openBracePositions.push(i);
    } else if (char === '}') {
      braces--;
      if (openBracePositions.length > 0) {
        openBracePositions.pop();
      }

      if (braces < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(i),
            end: document.positionAt(i + 1),
          },
          message: `Unexpected closing brace '}'`,
          source: 'burn-syntax',
        });
        braces = 0;
      }
    } else if (char === '(') {
      parentheses++;
      openParenPositions.push(i);
    } else if (char === ')') {
      parentheses--;
      if (openParenPositions.length > 0) {
        openParenPositions.pop();
      }

      if (parentheses < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(i),
            end: document.positionAt(i + 1),
          },
          message: `Unexpected closing parenthesis ')'`,
          source: 'burn-syntax',
        });
        parentheses = 0;
      }
    } else if (char === '[') {
      brackets++;
      openBracketPositions.push(i);
    } else if (char === ']') {
      brackets--;
      if (openBracketPositions.length > 0) {
        openBracketPositions.pop();
      }

      if (brackets < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(i),
            end: document.positionAt(i + 1),
          },
          message: `Unexpected closing bracket ']'`,
          source: 'burn-syntax',
        });
        brackets = 0;
      }
    } else if (/[a-zA-Z_]/.test(char)) {
      let j = i + 1;
      while (j < text.length && /[a-zA-Z0-9_]/.test(text.charAt(j))) {
        j++;
      }

      const word = text.substring(i, j);
      if (keywords.has(word)) {
        if (declarationKeywords.has(word) && j < text.length) {
          let k = j;

          while (k < text.length && /\s/.test(text.charAt(k))) {
            k++;
          }

          if (k < text.length && !/[a-zA-Z_]/.test(text.charAt(k))) {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: document.positionAt(i),
                end: document.positionAt(j),
              },
              message: `Expected identifier after '${word}'`,
              source: 'burn-syntax',
            });
          }
        }
      }

      i = j;
      continue;
    }

    i++;
  }

  if (braces > 0 && openBracePositions.length > 0) {
    const pos = openBracePositions[openBracePositions.length - 1];
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.positionAt(pos),
        end: document.positionAt(pos + 1),
      },
      message: `Unclosed brace '{'`,
      source: 'burn-syntax',
    });
  }

  if (parentheses > 0 && openParenPositions.length > 0) {
    const pos = openParenPositions[openParenPositions.length - 1];
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.positionAt(pos),
        end: document.positionAt(pos + 1),
      },
      message: `Unclosed parenthesis '('`,
      source: 'burn-syntax',
    });
  }

  if (brackets > 0 && openBracketPositions.length > 0) {
    const pos = openBracketPositions[openBracketPositions.length - 1];
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.positionAt(pos),
        end: document.positionAt(pos + 1),
      },
      message: `Unclosed bracket '['`,
      source: 'burn-syntax',
    });
  }

  if (inString && stringStart >= 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.positionAt(stringStart),
        end: document.positionAt(text.length),
      },
      message: `Unterminated string literal`,
      source: 'burn-syntax',
    });
  }

  return diagnostics;
}

function checkSemantics(document: TextDocument, text: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const declaredVars = new Set<string>();
  const declaredClasses = new Set<string>();
  const declaredTypes = new Set<string>();
  const varUsages = new Map<string, number[]>();

  const builtInTypes = new Set(['string', 'int', 'float', 'bool', 'nil', 'Date', 'Time', 'any']);

  const builtIns = new Set([
    'print',
    'toString',
    'input',
    'now',
    'formatDate',
    'createDate',
    'currentYear',
    'currentMonth',
    'currentDay',
    'power',
    'isEven',
    'join',
    'addDays',
    'subtractDays',
    'isLeapYear',
    'daysInMonth',
    'dayOfWeek',
    'i',
    'j',
    'k',
    'index',
    'value',
    'key',
    'true',
    'false',
  ]);

  const nonCodeRegions: { start: number; end: number; type: 'comment' | 'string' }[] = [];

  const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/g;
  let match;
  while ((match = classRegex.exec(text)) !== null) {
    const className = match[1];
    declaredClasses.add(className);
  }

  const typeRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/g;
  while ((match = typeRegex.exec(text)) !== null) {
    const typeName = match[1];
    declaredTypes.add(typeName);
  }

  const commentRegex = /\/\/.*$/gm;
  while ((match = commentRegex.exec(text)) !== null) {
    nonCodeRegions.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'comment',
    });
  }

  const stringRegex = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
  while ((match = stringRegex.exec(text)) !== null) {
    nonCodeRegions.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'string',
    });
  }

  const varDeclRegex =
    /(?:var|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:\s*[a-zA-Z_][a-zA-Z0-9_]*)?(?:\s*=\s*|$)/g;
  while ((match = varDeclRegex.exec(text)) !== null) {
    const varName = match[1];
    declaredVars.add(varName);
  }

  const forLoopRegex = /for\s*\(\s*var\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  while ((match = forLoopRegex.exec(text)) !== null) {
    const varName = match[1];
    declaredVars.add(varName);
  }

  const functionParamRegex = /fun\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(\s*([^)]*)\s*\)/g;
  while ((match = functionParamRegex.exec(text)) !== null) {
    const params = match[1].split(',');
    for (const param of params) {
      const paramMatch = /([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:\s*[a-zA-Z_][a-zA-Z0-9_]*)?/.exec(
        param.trim()
      );
      if (paramMatch) {
        declaredVars.add(paramMatch[1]);
      }
    }
  }

  const varRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b(?!\s*(?:=|\(|\{|\[|:))/g;
  while ((match = varRegex.exec(text)) !== null) {
    const varName = match[1];
    const pos = match.index;

    if (isInNonCodeRegion(pos, nonCodeRegions)) {
      continue;
    }

    if (
      ![
        'var',
        'const',
        'fun',
        'def',
        'class',
        'if',
        'else',
        'while',
        'for',
        'return',
        'import',
        'true',
        'false',
        'nil',
      ].includes(varName) &&
      !declaredVars.has(varName) &&
      !builtIns.has(varName.toLowerCase()) &&
      !declaredClasses.has(varName) &&
      !declaredTypes.has(varName) &&
      !builtInTypes.has(varName)
    ) {
      if (/^[0-9]+$/.test(varName) || varName === 'true' || varName === 'false') {
        continue;
      }

      const contextBefore = text.substring(Math.max(0, pos - 20), pos);
      if (contextBefore.trim().endsWith('.')) {
        continue;
      }

      if (!varUsages.has(varName)) {
        varUsages.set(varName, []);
      }
      const positions = varUsages.get(varName);
      if (positions) {
        positions.push(pos);
      }
    }
  }

  varUsages.forEach((positions, varName) => {
    if (
      !declaredVars.has(varName) &&
      !builtIns.has(varName.toLowerCase()) &&
      !declaredClasses.has(varName) &&
      !declaredTypes.has(varName) &&
      !builtInTypes.has(varName)
    ) {
      if (positions.length > 0) {
        const pos = positions[0];
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: document.positionAt(pos),
            end: document.positionAt(pos + varName.length),
          },
          message: `Variable '${varName}' is used but not declared`,
          source: 'burn-semantics',
        });
      }
    }
  });

  return diagnostics;
}

function isInNonCodeRegion(
  position: number,
  regions: { start: number; end: number; type: 'comment' | 'string' }[]
): boolean {
  for (const region of regions) {
    if (position >= region.start && position < region.end) {
      return true;
    }
  }
  return false;
}

function lintDocument(document: TextDocument, text: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const varDeclarations = new Map<string, { pos: number; isUsed: boolean }>();

  const varDeclRegex =
    /(?:var|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:\s*[a-zA-Z_][a-zA-Z0-9_]*)?(?:\s*=\s*|$)/g;
  let match;
  while ((match = varDeclRegex.exec(text)) !== null) {
    const varName = match[1];
    varDeclarations.set(varName, { pos: match.index, isUsed: false });
  }

  const varUsageRegex = /([a-zA-Z_][a-zA-Z0-9_]*)(?!\s*(?:=|\(|\{|\[|:))/g;
  while ((match = varUsageRegex.exec(text)) !== null) {
    const varName = match[1];
    const declaration = varDeclarations.get(varName);
    if (declaration) {
      declaration.isUsed = true;
    }
  }

  varDeclarations.forEach(({ pos, isUsed }, varName) => {
    if (!isUsed && !varName.startsWith('_')) {
      diagnostics.push({
        severity: DiagnosticSeverity.Hint,
        range: {
          start: document.positionAt(pos),
          end: document.positionAt(pos + varName.length + 4),
        },
        message: `Variable '${varName}' is declared but never used`,
        source: 'burn-lint',
      });
    }
  });

  const braceStyleRegex = /(fun|if|while|for|else)\s*[^{]*\s*\{/g;
  while ((match = braceStyleRegex.exec(text)) !== null) {
    const startPos = match.index;
    const openBracePos = text.indexOf('{', startPos);

    if (
      openBracePos > 0 &&
      text.charAt(openBracePos - 1) !== ' ' &&
      text.charAt(openBracePos - 1) !== '\n'
    ) {
      diagnostics.push({
        severity: DiagnosticSeverity.Hint,
        range: {
          start: document.positionAt(openBracePos),
          end: document.positionAt(openBracePos + 1),
        },
        message: 'Consider adding a space before opening brace for consistent style',
        source: 'burn-style',
      });
    }
  }

  return diagnostics;
}

function validateWithCompiler(document: TextDocument, compilerPath: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  const tempFilePath = getTempFilePath(document.uri);

  try {
    fs.writeFileSync(tempFilePath, document.getText());

    try {
      const options: ExecSyncOptionsWithStringEncoding = {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      };

      execSync(`${compilerPath} -c "${tempFilePath}"`, options);
    } catch (error) {
      if (error instanceof Error) {
        if ('stderr' in error) {
          const errorOutput = (error as { stderr: string }).stderr;

          if (!errorOutput.includes('runtime error: error reading input: EOF')) {
            parseCompilerOutput(errorOutput, diagnostics, document);
          }
        } else if ('stdout' in error) {
          const errorOutput = (error as { stdout: string }).stdout;

          if (!errorOutput.includes('runtime error: error reading input: EOF')) {
            parseCompilerOutput(errorOutput, diagnostics, document);
          }
        } else {
          connection.console.log(`Error running compiler: ${error.message}`);
        }
      }
    }
  } catch (error) {
    connection.console.log(
      `Error validating with compiler: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (e) {
      connection.console.log(
        `Error cleaning up temp file: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return Promise.resolve(diagnostics);
}

function parseCompilerOutput(
  output: string,
  diagnostics: Diagnostic[],
  document: TextDocument
): void {
  const errorLines = output.split('\n');

  for (const line of errorLines) {
    if (line.includes('runtime error: error reading input: EOF')) {
      continue;
    }

    
    const expectedVarMatch = /expected (?:variable name|expression) at line (\d+)/.exec(line);
    if (expectedVarMatch) {
      const lineNum = parseInt(expectedVarMatch[1], 10) - 1;
      
      const lineText = getLineText(document, lineNum);
      if (lineText) {
        
        
        const varMatch = /\b(var|const)\s+\s*$/.exec(lineText);
        let startChar = 0;
        let endChar = lineText.length;
        
        if (varMatch) {
          startChar = varMatch.index;
        } else {
          
          for (let i = lineText.length - 1; i >= 0; i--) {
            if (!/\s/.test(lineText[i])) {
              startChar = i;
              endChar = i + 1;
              break;
            }
          }
        }
        
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: lineNum, character: startChar },
            end: { line: lineNum, character: endChar },
          },
          message: line.includes('variable name') 
            ? `Expected variable name after '${varMatch ? varMatch[1] : 'var'}'`
            : `Expected expression`,
          source: 'burn-compiler',
        });
        continue;
      }
    }

    
    const mixedLineNumbersMatch = /(syntax|type|lexical) error at line (\d+), column (\d+): (.+) at line (\d+)/.exec(line);
    if (mixedLineNumbersMatch) {
      const [, errorType, firstLineStr, firstColStr, errorMessage, secondLineStr] = mixedLineNumbersMatch;
      const firstLineNum = parseInt(firstLineStr, 10) - 1;
      const firstColNum = parseInt(firstColStr, 10) - 1;
      const secondLineNum = parseInt(secondLineStr, 10) - 1;

      const firstLineText = getLineText(document, firstLineNum);
      if (firstLineText) {
        const range = getErrorRange(firstLineText, firstColNum);
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: firstLineNum, character: range.start },
            end: { line: firstLineNum, character: range.end },
          },
          message: `${errorType} error: ${errorMessage}`,
          source: 'burn-compiler',
        });
      }

      const secondLineText = getLineText(document, secondLineNum);
      if (secondLineText) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: secondLineNum, character: 0 },
            end: { line: secondLineNum, character: secondLineText.length },
          },
          message: `${errorType} error: ${errorMessage} (referenced from line ${(firstLineNum + 1).toString()})`,
          source: 'burn-compiler',
        });
      }
      continue;
    }

    
    const simpleMixedLineNumbersMatch = /(syntax|type|lexical) error at line (\d+)(?::|,)(.*?) at line (\d+)/.exec(line);
    if (simpleMixedLineNumbersMatch) {
      const [, errorType, firstLineStr, errorMessagePart, secondLineStr] = simpleMixedLineNumbersMatch;
      const firstLineNum = parseInt(firstLineStr, 10) - 1;
      const secondLineNum = parseInt(secondLineStr, 10) - 1;
      
      const errorMessage = errorMessagePart.trim() || 'expected expression';

      const firstLineText = getLineText(document, firstLineNum);
      if (firstLineText) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: firstLineNum, character: 0 },
            end: { line: firstLineNum, character: firstLineText.length },
          },
          message: `${errorType} error: ${errorMessage}`,
          source: 'burn-compiler',
        });
      }

      const secondLineText = getLineText(document, secondLineNum);
      if (secondLineText) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: secondLineNum, character: 0 },
            end: { line: secondLineNum, character: secondLineText.length },
          },
          message: `${errorType} error: ${errorMessage} (referenced from line ${(firstLineNum + 1).toString()})`,
          source: 'burn-compiler',
        });
      }
      continue;
    }

    
    const varInitErrorMatch =
      /(?:type|syntax) error at line (\d+), column (\d+): variable (\w+) must have a type or initializer/.exec(
        line
      );
    if (varInitErrorMatch) {
      const [, lineStr, colStr, varName] = varInitErrorMatch;
      
      const lineNum = parseInt(lineStr, 10) - 1;
      const colNum = parseInt(colStr, 10) - 1;

      const lineText = getLineText(document, lineNum);
      if (!lineText) {
        continue;
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: lineNum, character: colNum },
          end: { line: lineNum, character: colNum + varName.length },
        },
        message: `Variable '${varName}' must have a type or initializer`,
        source: 'burn-type',
      });
    }

    
    let match = /(lexical|syntax|type|runtime) error at line (\d+), column (\d+): (.+)/.exec(line);
    if (match) {
      const [, errorType, lineStr, colStr, message] = match;

      if (message.includes('error reading input') || message.includes('EOF')) {
        continue;
      }
      
      
      const lineNum = parseInt(lineStr, 10) - 1;
      const colNum = parseInt(colStr, 10) - 1;

      const lineText = getLineText(document, lineNum);
      if (!lineText) {
        console.log(`Warning: Line ${lineNum.toString()} not found in document`);
        continue;
      }

      const range = getErrorRange(lineText, colNum);
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: lineNum, character: range.start },
          end: { line: lineNum, character: range.end },
        },
        message: message,
        source: `burn-${errorType}`,
      });
      continue;
    }

    
    match = /.*(?:error|warning):\s+(.+) at line (\d+)(?:, column (\d+))?/.exec(line);
    if (match) {
      const [, message, lineStr, colStr] = match;

      if (message.includes('error reading input') || message.includes('EOF')) {
        continue;
      }
      
      
      const lineNum = parseInt(lineStr, 10) - 1;
      const colNum = colStr ? parseInt(colStr, 10) - 1 : 0;

      const lineText = getLineText(document, lineNum);
      if (!lineText) {
        console.log(`Warning: Line ${lineNum.toString()} not found in document`);
        continue;
      }

      
      const severity = line.includes('warning') 
        ? DiagnosticSeverity.Warning 
        : DiagnosticSeverity.Error;

      if (message.includes('variable') && message.includes('must have a type or initializer')) {
        const varNameMatch = /variable (\w+) must have/.exec(message);
        if (varNameMatch) {
          const varName = varNameMatch[1];

          const varIndex = lineText.indexOf(varName);

          if (varIndex >= 0) {
            diagnostics.push({
              severity: severity,
              range: {
                start: { line: lineNum, character: varIndex },
                end: { line: lineNum, character: varIndex + varName.length },
              },
              message: message,
              source: severity === DiagnosticSeverity.Warning ? 'burn-semantics' : 'burn-type',
            });
            continue;
          }
        }
      }

      diagnostics.push({
        severity: severity,
        range: {
          start: { line: lineNum, character: colNum },
          end: { line: lineNum, character: colNum + Math.min(10, lineText.length - colNum) },
        },
        message: message,
        source: severity === DiagnosticSeverity.Warning ? 'burn-semantics' : 'burn-compiler',
      });
    }
  }
}

function getLineText(document: TextDocument, line: number): string {
  try {
    const text = document.getText();
    const lines = text.split('\n');

    if (line >= 0 && line < lines.length) {
      return lines[line];
    }

    console.log(
      `Warning: Line ${line.toString()} is out of range (document has ${lines.length.toString()} lines)`
    );
    return '';
  } catch (error) {
    console.error(`Error getting line text for line ${line.toString()}:`, error);
    return '';
  }
}

function getErrorRange(lineText: string, startCol: number): { start: number; end: number } {
  if (startCol >= lineText.length) {
    return { start: Math.max(0, lineText.length - 1), end: lineText.length };
  }

  let endCol = startCol;

  if (/[+\-*\/=%&|<>!^]/.test(lineText[startCol])) {
    while (endCol < lineText.length && /[+\-*\/=%&|<>!^]/.test(lineText[endCol])) {
      endCol++;
    }
    return { start: startCol, end: endCol };
  }

  if (/[a-zA-Z0-9_]/.test(lineText[startCol])) {
    let identStart = startCol;

    while (identStart > 0 && /[a-zA-Z0-9_]/.test(lineText[identStart - 1])) {
      identStart--;
    }

    endCol = startCol;
    while (endCol < lineText.length && /[a-zA-Z0-9_]/.test(lineText[endCol])) {
      endCol++;
    }

    return { start: identStart, end: endCol };
  }

  return { start: startCol, end: Math.min(startCol + 1, lineText.length) };
}

export function clearDiagnosticsCache(uri: string): void {
  diagnosticsCache.delete(uri);
}
