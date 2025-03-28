import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Connection, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { execSync } from 'child_process';

export function getPathFromURI(uri: string): string {
  return URI.parse(uri).fsPath;
}

export function getURIFromPath(filePath: string): string {
  return URI.file(filePath).toString();
}

export function getTempFilePath(uri: string, extension = '.bn'): string {
  const hash = crypto.createHash('md5').update(uri).digest('hex');
  return path.join(os.tmpdir(), `burn-${hash}${extension}`);
}

export function getWorkspaceRoot(connection: Connection, documentUri: string): string {
  const uri = URI.parse(documentUri);
  return path.dirname(uri.fsPath);
}

export function resolveImportPath(
  importPath: string,
  currentFilePath: string,
  workspaceRoot: string
): string {
  if (importPath.startsWith('/')) {
    return path.join(workspaceRoot, importPath);
  } else {
    return path.join(path.dirname(currentFilePath), importPath);
  }
}

export function getAllBurnFiles(workspaceRoot: string): string[] {
  const burnFiles: string[] = [];

  try {
    const queue = [workspaceRoot];

    while (queue.length > 0) {
      const dir = queue.shift();
      if (!dir) continue;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            queue.push(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.bn')) {
            burnFiles.push(fullPath);
          }
        }
      } catch (innerError) {
        console.error(`Error reading directory ${dir}:`, innerError);
      }
    }
  } catch (error) {
    console.error('Error finding burn files:', error);
  }

  return burnFiles;
}

export function getStandardLibraryFunctions(): Map<
  string,
  { parameters: string[]; returnType: string; documentation: string }
> {
  const stdLibs = new Map<
    string,
    { parameters: string[]; returnType: string; documentation: string }
  >();
  const types = new Map<string, Map<string, string>>();

  try {
    stdLibs.set('now', {
      parameters: [],
      returnType: 'Date',
      documentation: 'Returns the current date as a Date object with year, month, and day fields.',
    });

    stdLibs.set('formatDate', {
      parameters: ['Date'],
      returnType: 'string',
      documentation: 'Formats a Date object as a string in YYYY-MM-DD format.',
    });

    stdLibs.set('createDate', {
      parameters: ['int', 'int', 'int'],
      returnType: 'Date',
      documentation: 'Creates a new Date object with the specified year, month, and day.',
    });

    stdLibs.set('currentYear', {
      parameters: [],
      returnType: 'int',
      documentation: 'Returns the current year as an integer.',
    });

    stdLibs.set('currentMonth', {
      parameters: [],
      returnType: 'int',
      documentation: 'Returns the current month (1-12) as an integer.',
    });

    stdLibs.set('currentDay', {
      parameters: [],
      returnType: 'int',
      documentation: 'Returns the current day of the month as an integer.',
    });

    stdLibs.set('addDays', {
      parameters: ['Date', 'int'],
      returnType: 'Date',
      documentation: 'Adds the specified number of days to a date and returns a new Date object.',
    });

    stdLibs.set('subtractDays', {
      parameters: ['Date', 'int'],
      returnType: 'Date',
      documentation:
        'Subtracts the specified number of days from a date and returns a new Date object.',
    });

    stdLibs.set('isLeapYear', {
      parameters: ['int'],
      returnType: 'bool',
      documentation: 'Checks if a year is a leap year and returns true or false.',
    });

    stdLibs.set('daysInMonth', {
      parameters: ['int', 'int'],
      returnType: 'int',
      documentation: 'Returns the number of days in the specified month of the given year.',
    });

    stdLibs.set('dayOfWeek', {
      parameters: ['Date'],
      returnType: 'int',
      documentation:
        'Returns the day of the week (0=Saturday, 1=Sunday, ..., 6=Friday) for the given date.',
    });

    stdLibs.set('createTime', {
      parameters: ['int', 'int', 'int', 'int'],
      returnType: 'Time',
      documentation:
        'Creates a new Time object with the specified hours, minutes, seconds, and milliseconds.',
    });

    stdLibs.set('currentTime', {
      parameters: [],
      returnType: 'Time',
      documentation: 'Returns the current time as a Time object.',
    });

    stdLibs.set('formatTime', {
      parameters: ['Time', 'bool'],
      returnType: 'string',
      documentation:
        'Formats a Time object as a string (HH:MM:SS or HH:MM:SS.mmm if includeMilliseconds is true).',
    });

    stdLibs.set('print', {
      parameters: ['any'],
      returnType: '',
      documentation: 'Prints the value to the console.',
    });

    stdLibs.set('toString', {
      parameters: ['any'],
      returnType: 'string',
      documentation: 'Converts a value to a string.',
    });

    stdLibs.set('input', {
      parameters: ['string'],
      returnType: 'string',
      documentation: 'Reads a line of input from the user with the given prompt.',
    });

    stdLibs.set('power', {
      parameters: ['int', 'int'],
      returnType: 'int',
      documentation: 'Calculates the power of a number (base^exp).',
    });

    stdLibs.set('isEven', {
      parameters: ['int'],
      returnType: 'bool',
      documentation: 'Checks if a number is even.',
    });

    stdLibs.set('join', {
      parameters: ['string', 'string', 'string'],
      returnType: 'string',
      documentation: 'Joins two strings with a separator.',
    });

    stdLibs.set('split', {
      parameters: ['string', 'string'],
      returnType: 'array',
      documentation: 'Splits a string by the given delimiter and returns an array of substrings.',
    });

    stdLibs.set('charAt', {
      parameters: ['string', 'int'],
      returnType: 'string',
      documentation: 'Returns the character at the specified index in a string.',
    });

    stdLibs.set('parseInt', {
      parameters: ['string'],
      returnType: 'int',
      documentation: 'Parses a string into an integer.',
    });

    stdLibs.set('size', {
      parameters: ['string'],
      returnType: 'int',
      documentation: 'Returns the length of a string.',
    });

    stdLibs.set('substring', {
      parameters: ['string', 'int', 'int'],
      returnType: 'string',
      documentation:
        'Returns a substring of the given string from start index (inclusive) to end index (exclusive).',
    });

    stdLibs.set('append', {
      parameters: ['array', 'any'],
      returnType: 'array',
      documentation: 'Appends an item to an array and returns the new array.',
    });
  } catch (error) {
    console.error('Error loading standard library functions:', error);
  }

  try {
    const dateFields = new Map<string, string>();
    dateFields.set('year', 'int');
    dateFields.set('month', 'int');
    dateFields.set('day', 'int');

    types.set('Date', dateFields);
    stdLibs.set('append', {
      parameters: ['array', 'any'],
      returnType: 'array',
      documentation: 'Appends an item to an array and returns the new array.',
    });
    types.set('Date', dateFields);

    const timeFields = new Map<string, string>();
    timeFields.set('hours', 'int');
    timeFields.set('minutes', 'int');
    timeFields.set('seconds', 'int');
    timeFields.set('milliseconds', 'int');
    types.set('Time', timeFields);
  } catch (error) {
    console.error('Error loading standard library types:', error);
  }

  return stdLibs;
}

export function getTokenAtPosition(
  code: string,
  position: number
): {
  value: string;
  start: number;
  end: number;
  type: 'identifier' | 'keyword' | 'string' | 'number' | 'other';
} {
  if (position < 0 || position >= code.length) {
    return { value: '', start: position, end: position, type: 'other' };
  }

  const keywords = new Set([
    'fun',
    'var',
    'const',
    'def',
    'if',
    'else',
    'return',
    'while',
    'for',
    'true',
    'false',
    'int',
    'float',
    'string',
    'bool',
    'import',
    'class',
  ]);

  if (/\s/.test(code[position])) {
    return { value: '', start: position, end: position, type: 'other' };
  }

  if (code[position] === '"' || code[position] === "'") {
    const quoteChar = code[position];
    const start = position;
    let end = position + 1;

    while (end < code.length && code[end] !== quoteChar) {
      if (code[end] === '\\' && end + 1 < code.length) {
        end += 2;
        continue;
      }
      end++;
    }

    if (end < code.length && code[end] === quoteChar) {
      end++;
    }

    return {
      value: code.substring(start, end),
      start,
      end,
      type: 'string',
    };
  }

  if (/[0-9]/.test(code[position])) {
    let start = position;
    let end = position;

    while (start > 0 && /[0-9.]/.test(code[start - 1])) {
      start--;
    }

    while (end < code.length && /[0-9.]/.test(code[end])) {
      end++;
    }

    return {
      value: code.substring(start, end),
      start,
      end,
      type: 'number',
    };
  }

  if (/[a-zA-Z_]/.test(code[position])) {
    let start = position;
    let end = position;

    while (start > 0 && /[a-zA-Z0-9_]/.test(code[start - 1])) {
      start--;
    }

    while (end < code.length && /[a-zA-Z0-9_]/.test(code[end])) {
      end++;
    }

    const value = code.substring(start, end);
    const type = keywords.has(value) ? 'keyword' : 'identifier';

    return { value, start, end, type };
  }

  return {
    value: code[position],
    start: position,
    end: position + 1,
    type: 'other',
  };
}

/**
 * Get line and column from a position in text
 */
export function getLineAndCol(text: string, position: number): { line: number; col: number } {
  let line = 0;
  let col = 0;

  for (let i = 0; i < position && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      col = 0;
    } else {
      col++;
    }
  }

  return { line, col };
}

/**
 * Get position from line and column
 */
export function getPositionFromLineCol(text: string, line: number, col: number): number {
  let currentLine = 0;
  let currentCol = 0;
  let position = 0;

  for (let i = 0; i < text.length; i++) {
    if (currentLine === line && currentCol === col) {
      return i;
    }

    if (text[i] === '\n') {
      currentLine++;
      currentCol = 0;
    } else {
      currentCol++;
    }

    position++;
  }

  return position;
}

/**
 * Get the text of a specific line
 */
export function getLineText(text: string, line: number): string {
  const lines = text.split('\n');
  if (line >= 0 && line < lines.length) {
    return lines[line];
  }
  return '';
}

/**
 * Format error message with source code context
 * Mimics the Burn compiler's error formatting
 */
export function formatErrorWithContext(
  errorType: string,
  message: string,
  source: string,
  line: number,
  col: number
): string {
  const lines = source.split('\n');
  const errorLine = lines[line];

  if (!errorLine) {
    return `${errorType} error at line ${(line + 1).toString()}, column ${(col + 1).toString()}: ${message}`;
  }

  let result = `${errorType} error at line ${(line + 1).toString()}, column ${(col + 1).toString()}: ${message}\n\n`;

  if (line > 0) {
    result += `${line.toString()} | ${lines[line - 1]}\n`;
  }

  result += `${(line + 1).toString()} | ${errorLine}\n`;
  result += `${' '.repeat(String(line + 1).length + 3)}${'^'.repeat(1)}\n`;

  if (line < lines.length - 1) {
    result += `${(line + 2).toString()} | ${lines[line + 1]}\n`;
  }

  return result;
}

export function extractImports(source: string): string[] {
  const imports: string[] = [];

  const singleImportRegex = /import\s+["']([^"']+)["']/g;
  let match;
  while ((match = singleImportRegex.exec(source)) !== null) {
    imports.push(match[1]);
  }

  const multiImportRegex = /import\s*\(([^)]*)\)/gs;
  const pathRegex = /["']([^"']+)["']/g;

  while ((match = multiImportRegex.exec(source)) !== null) {
    const importBlock = match[1];
    let pathMatch;
    while ((pathMatch = pathRegex.exec(importBlock)) !== null) {
      imports.push(pathMatch[1]);
    }
  }

  return imports;
}

export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    console.error(
      `Error checking if file exists: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

export function compileBurnFile(
  filePath: string,
  compilerPath: string
): {
  success: boolean;
  output: string;
  errors: { line: number; col: number; message: string; type: string }[];
} {
  try {
    if (!fileExists(compilerPath)) {
      return {
        success: false,
        output: `Compiler not found at: ${compilerPath}`,
        errors: [],
      };
    }

    const output = execSync(`${compilerPath} -d "${filePath}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return { success: true, output, errors: [] };
  } catch (error) {
    let output = '';
    const errors: { line: number; col: number; message: string; type: string }[] = [];

    if (error instanceof Error) {
      if ('stdout' in error) {
        output = (error as unknown as { stdout: string }).stdout;
      }
      if ('stderr' in error) {
        const stderr = (error as unknown as { stderr: string }).stderr;
        output += stderr;

        const errorLines = stderr.split('\n');
        for (const line of errorLines) {
          const match =
            /(lexical|syntax|type|runtime) error at line (\d+), column (\d+): (.+)/.exec(line);
          if (match) {
            const [, type, lineStr, colStr, message] = match;
            errors.push({
              line: parseInt(lineStr, 10) - 1,
              col: parseInt(colStr, 10) - 1,
              message,
              type,
            });
          }
        }
      }
    }

    return { success: false, output, errors };
  }
}

/**
 * Find all type definitions in Burn source code
 */
export function findTypeDefinitions(source: string): Map<string, Map<string, string>> {
  const types = new Map<string, Map<string, string>>();
  const typeRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{([^}]*)\}/g;

  let match;
  while ((match = typeRegex.exec(source)) !== null) {
    const typeName = match[1];
    const fieldsText = match[2].trim();
    const fields = new Map<string, string>();

    if (fieldsText) {
      const fieldEntries = fieldsText.split(',');
      for (const fieldEntry of fieldEntries) {
        const fieldParts = fieldEntry.trim().split(':');
        if (fieldParts.length === 2) {
          const fieldName = fieldParts[0].trim();
          const fieldType = fieldParts[1].trim();
          fields.set(fieldName, fieldType);
        }
      }
    }

    types.set(typeName, fields);
  }

  return types;
}

export function findFunctionDeclarations(source: string): Map<
  string,
  {
    parameters: { name: string; type: string }[];
    returnType: string;
    position: { start: number; end: number };
  }
> {
  const functions = new Map<
    string,
    {
      parameters: { name: string; type: string }[];
      returnType: string;
      position: { start: number; end: number };
    }
  >();
  const functionRegex =
    /fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)(?:\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*\{/g;

  let match;
  while ((match = functionRegex.exec(source)) !== null) {
    const functionName = match[1];
    const paramsText = match[2].trim();
    const returnType = match[3] || '';
    const params: { name: string; type: string }[] = [];

    if (paramsText) {
      const paramEntries = paramsText.split(',');
      for (const paramEntry of paramEntries) {
        const paramParts = paramEntry.trim().split(':');
        if (paramParts.length === 2) {
          const paramName = paramParts[0].trim();
          const paramType = paramParts[1].trim();
          params.push({ name: paramName, type: paramType });
        }
      }
    }

    functions.set(functionName, {
      parameters: params,
      returnType,
      position: { start: match.index, end: match.index + match[0].length },
    });
  }

  return functions;
}

export function findClassDeclarations(source: string): Map<
  string,
  {
    methods: Map<
      string,
      {
        parameters: { name: string; type: string }[];
        returnType: string;
        position: { start: number; end: number };
      }
    >;
    position: { start: number; end: number };
  }
> {
  const classes = new Map<
    string,
    {
      methods: Map<
        string,
        {
          parameters: { name: string; type: string }[];
          returnType: string;
          position: { start: number; end: number };
        }
      >;
      position: { start: number; end: number };
    }
  >();
  const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{([^}]*)\}/gs;

  let match;
  while ((match = classRegex.exec(source)) !== null) {
    const className = match[1];
    const classBody = match[2];
    const classMethods = new Map<
      string,
      {
        parameters: { name: string; type: string }[];
        returnType: string;
        position: { start: number; end: number };
      }
    >();

    const methodRegex =
      /fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)(?:\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*\{/g;
    let methodMatch;

    while ((methodMatch = methodRegex.exec(classBody)) !== null) {
      const methodName = methodMatch[1];
      const paramsText = methodMatch[2].trim();
      const returnType = methodMatch[3] || '';
      const params: { name: string; type: string }[] = [];

      if (paramsText) {
        const paramEntries = paramsText.split(',');
        for (const paramEntry of paramEntries) {
          const paramParts = paramEntry.trim().split(':');
          if (paramParts.length === 2) {
            const paramName = paramParts[0].trim();
            const paramType = paramParts[1].trim();
            params.push({ name: paramName, type: paramType });
          }
        }
      }

      classMethods.set(methodName, {
        parameters: params,
        returnType,
        position: {
          start: match.index + methodMatch.index,
          end: match.index + methodMatch.index + methodMatch[0].length,
        },
      });
    }

    classes.set(className, {
      methods: classMethods,
      position: { start: match.index, end: match.index + match[0].length },
    });
  }

  return classes;
}

export function positionToOffset(
  document: TextDocument,
  position: { line: number; character: number }
): number {
  return document.offsetAt(Position.create(position.line, position.character));
}

export function offsetToPosition(document: TextDocument, offset: number): Position {
  return document.positionAt(offset);
}

export function getBurnVersion(workspaceRoot: string): string {
  try {
    const cmdGoPath = path.join(workspaceRoot, 'cmd', 'cmd.go');
    if (fs.existsSync(cmdGoPath)) {
      const content = fs.readFileSync(cmdGoPath, 'utf8');
      const versionMatch = /func getVersion\(\) string \{\s*return "([\d.]+)"/m.exec(content);
      if (versionMatch) {
        return versionMatch[1];
      }
    }

    return '0.1.0';
  } catch (error) {
    console.error('Error getting Burn version:', error);
    return '0.1.0';
  }
}
