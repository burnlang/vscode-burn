import * as fs from 'fs';
import * as path from 'path';
import { Diagnostic, DiagnosticSeverity, Position, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { execSync } from 'child_process';
import { getTempFilePath } from './utils';

export interface Parameter {
  name: string;
  type: string;
}

export interface FunctionType {
  parameters: Parameter[];
  returnType: string;
  documentation?: string;
  location?: {
    uri: string;
    range: Range;
  };
}

export interface ClassMethod extends FunctionType {
  className: string;
}

export interface TypeDefinition {
  fields: Map<string, string>;
  location?: {
    uri: string;
    range: Range;
  };
}

export class BurnTypeTracker {
  private variables = new Map<
    string,
    Map<string, { type: string; location: Range; isConst: boolean }>
  >();
  private functions = new Map<string, Map<string, FunctionType>>();
  private types = new Map<string, Map<string, TypeDefinition>>();
  private classes = new Map<string, Map<string, ClassMethod>>();
  private imports = new Map<string, string[]>();
  private currentFile = '';
  private workspaceRoot = '';
  private compilerPath = './burn.exe';

  constructor(workspaceRoot = '', compilerPath?: string) {
    this.workspaceRoot = workspaceRoot;
    if (compilerPath) {
      this.compilerPath = compilerPath;
    }
    this.initializeBuiltins();
  }

  public setCompilerPath(compilerPath: string): void {
    this.compilerPath = compilerPath;
  }

  public setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  public getVariables(uri: string): Map<string, string> | undefined {
    const fileVars = this.variables.get(uri);
    if (!fileVars) return undefined;

    const result = new Map<string, string>();
    fileVars.forEach((details, name) => {
      result.set(name, details.type);
    });
    return result;
  }

  public getConstants(uri: string): Map<string, string> | undefined {
    const fileVars = this.variables.get(uri);
    if (!fileVars) return undefined;

    const result = new Map<string, string>();
    fileVars.forEach((details, name) => {
      if (details.isConst) {
        result.set(name, details.type);
      }
    });
    return result;
  }

  private initializeBuiltins(): void {
    const dateFields = new Map<string, string>();
    dateFields.set('year', 'int');
    dateFields.set('month', 'int');
    dateFields.set('day', 'int');

    const timeFields = new Map<string, string>();
    timeFields.set('hours', 'int');
    timeFields.set('minutes', 'int');
    timeFields.set('seconds', 'int');
    timeFields.set('milliseconds', 'int');

    const builtinTypes = new Map<string, TypeDefinition>();
    builtinTypes.set('Date', { fields: dateFields });
    builtinTypes.set('Time', { fields: timeFields });

    this.types.set('__builtin__', builtinTypes);

    const builtinFunctions = new Map<string, FunctionType>();

    builtinFunctions.set('print', {
      parameters: [{ name: 'value', type: 'any' }],
      returnType: '',
      documentation: 'Prints a value to the console.',
    });

    builtinFunctions.set('toString', {
      parameters: [{ name: 'value', type: 'any' }],
      returnType: 'string',
      documentation: 'Converts a value to a string representation.',
    });

    builtinFunctions.set('input', {
      parameters: [{ name: 'prompt', type: 'string' }],
      returnType: 'string',
      documentation: 'Reads a line of input from the user with the given prompt.',
    });

    builtinFunctions.set('now', {
      parameters: [],
      returnType: 'Date',
      documentation: 'Returns the current date as a Date object.',
    });

    builtinFunctions.set('formatDate', {
      parameters: [{ name: 'date', type: 'Date' }],
      returnType: 'string',
      documentation: 'Formats a Date object as a string.',
    });

    builtinFunctions.set('createDate', {
      parameters: [
        { name: 'year', type: 'int' },
        { name: 'month', type: 'int' },
        { name: 'day', type: 'int' },
      ],
      returnType: 'Date',
      documentation: 'Creates a new Date object with the specified year, month, and day.',
    });

    builtinFunctions.set('power', {
      parameters: [
        { name: 'base', type: 'int' },
        { name: 'exp', type: 'int' },
      ],
      returnType: 'int',
      documentation: 'Calculates the power of a number (base^exp).',
    });

    builtinFunctions.set('isEven', {
      parameters: [{ name: 'num', type: 'int' }],
      returnType: 'bool',
    });

    builtinFunctions.set('isEven', {
      parameters: [{ name: 'num', type: 'int' }],
      returnType: 'bool',
      documentation: 'Checks if a number is even.',
    });

    builtinFunctions.set('join', {
      parameters: [
        { name: 'str1', type: 'string' },
        { name: 'str2', type: 'string' },
        { name: 'separator', type: 'string' },
      ],
      returnType: 'string',
      documentation: 'Joins two strings with a separator.',
    });

    builtinFunctions.set('currentYear', {
      parameters: [],
      returnType: 'int',
      documentation: 'Returns the current year.',
    });

    builtinFunctions.set('currentMonth', {
      parameters: [],
      returnType: 'int',
      documentation: 'Returns the current month (1-12).',
    });

    builtinFunctions.set('currentDay', {
      parameters: [],
      returnType: 'int',
      documentation: 'Returns the current day of the month.',
    });

    builtinFunctions.set('addDays', {
      parameters: [
        { name: 'date', type: 'Date' },
        { name: 'days', type: 'int' },
      ],
      returnType: 'Date',
      documentation: 'Adds the specified number of days to a date.',
    });

    builtinFunctions.set('subtractDays', {
      parameters: [
        { name: 'date', type: 'Date' },
        { name: 'days', type: 'int' },
      ],
      returnType: 'Date',
      documentation: 'Subtracts the specified number of days from a date.',
    });

    builtinFunctions.set('isLeapYear', {
      parameters: [{ name: 'year', type: 'int' }],
      returnType: 'bool',
      documentation: 'Checks if a year is a leap year.',
    });

    builtinFunctions.set('daysInMonth', {
      parameters: [
        { name: 'year', type: 'int' },
        { name: 'month', type: 'int' },
      ],
      returnType: 'int',
      documentation: 'Returns the number of days in the specified month.',
    });

    builtinFunctions.set('dayOfWeek', {
      parameters: [{ name: 'date', type: 'Date' }],
      returnType: 'int',
      documentation: 'Returns the day of the week (0 = Sunday, 6 = Saturday).',
    });

    this.functions.set('__builtin__', builtinFunctions);
  }

  public setCurrentFile(fileUri: string): void {
    this.currentFile = fileUri;

    if (!this.variables.has(fileUri)) {
      this.variables.set(fileUri, new Map());
    }
    if (!this.functions.has(fileUri)) {
      this.functions.set(fileUri, new Map());
    }
    if (!this.types.has(fileUri)) {
      this.types.set(fileUri, new Map());
    }
    if (!this.classes.has(fileUri)) {
      this.classes.set(fileUri, new Map());
    }
    if (!this.imports.has(fileUri)) {
      this.imports.set(fileUri, []);
    }
  }

  public addVariable(name: string, type: string, range: Range, isConst = false): void {
    const vars = this.variables.get(this.currentFile);
    if (vars) {
      vars.set(name, { type, location: range, isConst });
    }
  }

  public addFunction(name: string, functionType: FunctionType, range: Range): void {
    const funcs = this.functions.get(this.currentFile);
    if (funcs) {
      functionType.location = {
        uri: this.currentFile,
        range,
      };
      funcs.set(name, functionType);
    }
  }

  public addType(typeName: string, fields: Map<string, string>, range: Range): void {
    const types = this.types.get(this.currentFile);
    if (types) {
      types.set(typeName, {
        fields,
        location: {
          uri: this.currentFile,
          range,
        },
      });
    }
  }

  public addClass(className: string, methods: Map<string, ClassMethod>, range: Range): void {
    const classes = this.classes.get(this.currentFile);
    if (classes) {
      for (const [methodName, method] of methods.entries()) {
        method.location = {
          uri: this.currentFile,
          range,
        };
        classes.set(methodName, method);
      }
    }
  }

  public addImport(importPath: string): void {
    const imports = this.imports.get(this.currentFile);
    if (imports) {
      imports.push(importPath);
      this.parseImportedFile(importPath);
    }
  }

  private parseImportedFile(importPath: string): void {
    let fullPath = importPath;
    if (!path.isAbsolute(importPath)) {
      if (importPath.startsWith('std/')) {
        const stdLibPath = path.join(this.workspaceRoot, 'src', 'lib', importPath);
        if (fs.existsSync(stdLibPath)) {
          fullPath = stdLibPath;
        } else {
          const stdLibPathWithExt = stdLibPath + '.bn';
          if (fs.existsSync(stdLibPathWithExt)) {
            fullPath = stdLibPathWithExt;
          }
        }
      } else {
        const currentDir = path.dirname(this.currentFile.replace('file://', ''));
        fullPath = path.join(currentDir, importPath);

        if (!fullPath.endsWith('.bn')) {
          fullPath += '.bn';
        }
      }
    }

    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const importedFileUri = 'file://' + fullPath;

        this.extractTypesAndFunctionsFromText(content, importedFileUri);
      }
    } catch (error) {
      console.error(`Error parsing imported file ${importPath}:`, error);
    }
  }

  private extractTypesAndFunctionsFromText(text: string, uri: string): void {
    const prevFile = this.currentFile;
    this.setCurrentFile(uri);

    const typeRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{([^}]*)\}/g;
    let match;

    while ((match = typeRegex.exec(text)) !== null) {
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

      const startPos = this.getPositionFromOffset(text, match.index);
      const endPos = this.getPositionFromOffset(text, match.index + match[0].length);
      const range = { start: startPos, end: endPos };

      this.addType(typeName, fields, range);
    }

    const functionRegex =
      /fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)(?:\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*\{/g;

    while ((match = functionRegex.exec(text)) !== null) {
      const functionName = match[1];
      const paramsText = match[2].trim();
      const returnType = match[3] || '';
      const params: Parameter[] = [];

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

      const startPos = this.getPositionFromOffset(text, match.index);
      const endPos = this.getPositionFromOffset(text, match.index + match[0].length);
      const range = { start: startPos, end: endPos };

      this.addFunction(
        functionName,
        {
          parameters: params,
          returnType,
        },
        range
      );
    }

    const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{([^}]*)\}/gs;

    while ((match = classRegex.exec(text)) !== null) {
      const className = match[1];
      const classBody = match[2];

      const classStartPos = this.getPositionFromOffset(text, match.index);
      const classEndPos = this.getPositionFromOffset(text, match.index + match[0].length);
      const classRange = { start: classStartPos, end: classEndPos };

      const methodRegex =
        /fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)(?:\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*\{/g;
      let methodMatch;
      const methods = new Map<string, ClassMethod>();

      while ((methodMatch = methodRegex.exec(classBody)) !== null) {
        const methodName = methodMatch[1];
        const paramsText = methodMatch[2].trim();
        const returnType = methodMatch[3] || '';
        const params: Parameter[] = [];

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

        methods.set(methodName, {
          parameters: params,
          returnType,
          className,
        });
      }

      this.addClass(className, methods, classRange);
    }

    this.currentFile = prevFile;
  }

  private getPositionFromOffset(text: string, offset: number): Position {
    let line = 0;
    let character = 0;

    for (let i = 0; i < offset; i++) {
      if (text[i] === '\n') {
        line++;
        character = 0;
      } else {
        character++;
      }
    }

    return { line, character };
  }

  public getVariableType(name: string): string | undefined {
    const vars = this.variables.get(this.currentFile);
    const varInfo = vars?.get(name);
    if (varInfo) return varInfo.type;

    const imports = this.imports.get(this.currentFile) ?? [];
    for (const importPath of imports) {
      for (const [uri, varMap] of this.variables.entries()) {
        if (uri !== this.currentFile && uri.includes(importPath)) {
          const importedVarInfo = varMap.get(name);
          if (importedVarInfo) return importedVarInfo.type;
        }
      }
    }

    return undefined;
  }

  public getFunction(name: string): FunctionType | undefined {
    const funcs = this.functions.get(this.currentFile);
    const localFn = funcs?.get(name);
    if (localFn) return localFn;

    const builtinFuncs = this.functions.get('__builtin__');
    const builtinFn = builtinFuncs?.get(name);
    if (builtinFn) return builtinFn;

    const imports = this.imports.get(this.currentFile) ?? [];
    for (const importPath of imports) {
      for (const [uri, funcMap] of this.functions.entries()) {
        if (uri !== this.currentFile && uri.includes(importPath)) {
          const importedFn = funcMap.get(name);
          if (importedFn) return importedFn;
        }
      }
    }

    return undefined;
  }

  public getType(typeName: string): Map<string, string> | undefined {
    const builtinTypes = this.types.get('__builtin__');
    const builtinType = builtinTypes?.get(typeName);
    if (builtinType) return builtinType.fields;

    const types = this.types.get(this.currentFile);
    const localType = types?.get(typeName);
    if (localType) return localType.fields;

    const imports = this.imports.get(this.currentFile) ?? [];
    for (const importPath of imports) {
      for (const [uri, typeMap] of this.types.entries()) {
        if (uri !== this.currentFile && uri.includes(importPath)) {
          const importedType = typeMap.get(typeName);
          if (importedType) return importedType.fields;
        }
      }
    }

    return undefined;
  }

  public getClassMethods(className: string): Map<string, FunctionType> | undefined {
    const result = new Map<string, FunctionType>();

    for (const [, classMap] of this.classes.entries()) {
      for (const [methodName, method] of classMap.entries()) {
        if (method.className === className) {
          result.set(methodName, method);
        }
      }
    }

    return result.size > 0 ? result : undefined;
  }

  public getDefinitionLocation(name: string): { uri: string; range: Range } | undefined {
    const vars = this.variables.get(this.currentFile);
    const varInfo = vars?.get(name);
    if (varInfo?.location) {
      return { uri: this.currentFile, range: varInfo.location };
    }

    const funcs = this.functions.get(this.currentFile);
    const fn = funcs?.get(name);
    if (fn?.location) {
      return fn.location;
    }

    const types = this.types.get(this.currentFile);
    const type = types?.get(name);
    if (type?.location) {
      return type.location;
    }

    return undefined;
  }

  public getAllFunctions(): [string, FunctionType][] {
    const result: [string, FunctionType][] = [];
    const added = new Set<string>();

    const builtinFuncs = this.functions.get('__builtin__');
    if (builtinFuncs) {
      builtinFuncs.forEach((type, name) => {
        result.push([name, type]);
        added.add(name);
      });
    }

    const currentFileFuncs = this.functions.get(this.currentFile);
    if (currentFileFuncs) {
      currentFileFuncs.forEach((type, name) => {
        if (!added.has(name)) {
          result.push([name, type]);
          added.add(name);
        }
      });
    }

    const imports = this.imports.get(this.currentFile) ?? [];
    for (const importPath of imports) {
      for (const [uri, funcMap] of this.functions.entries()) {
        if (uri !== this.currentFile && uri !== '__builtin__' && uri.includes(importPath)) {
          funcMap.forEach((type, name) => {
            if (!added.has(name)) {
              result.push([name, type]);
              added.add(name);
            }
          });
        }
      }
    }

    for (const [uri, funcMap] of this.functions.entries()) {
      if (uri !== this.currentFile && uri !== '__builtin__') {
        funcMap.forEach((type, name) => {
          if (!added.has(name)) {
            result.push([name, type]);
            added.add(name);
          }
        });
      }
    }

    return result;
  }

  public getAllTypes(): [string, Map<string, string>][] {
    const result: [string, Map<string, string>][] = [];
    const added = new Set<string>();

    const primitiveTypes = ['int', 'float', 'string', 'bool'];
    for (const typeName of primitiveTypes) {
      result.push([typeName, new Map<string, string>()]);
      added.add(typeName);
    }

    const builtinTypes = this.types.get('__builtin__');
    if (builtinTypes) {
      builtinTypes.forEach((typeInfo, name) => {
        if (!added.has(name)) {
          result.push([name, typeInfo.fields]);
          added.add(name);
        }
      });
    }

    const currentFileTypes = this.types.get(this.currentFile);
    if (currentFileTypes) {
      currentFileTypes.forEach((typeInfo, name) => {
        if (!added.has(name)) {
          result.push([name, typeInfo.fields]);
          added.add(name);
        }
      });
    }

    const imports = this.imports.get(this.currentFile) ?? [];
    for (const importPath of imports) {
      for (const [uri, typeMap] of this.types.entries()) {
        if (uri !== this.currentFile && uri !== '__builtin__' && uri.includes(importPath)) {
          typeMap.forEach((typeInfo, name) => {
            if (!added.has(name)) {
              result.push([name, typeInfo.fields]);
              added.add(name);
            }
          });
        }
      }
    }

    for (const [uri, typeMap] of this.types.entries()) {
      if (uri !== this.currentFile && uri !== '__builtin__') {
        typeMap.forEach((typeInfo, name) => {
          if (!added.has(name)) {
            result.push([name, typeInfo.fields]);
            added.add(name);
          }
        });
      }
    }

    return result;
  }

  public parseDocument(document: TextDocument): Diagnostic[] {
    this.setCurrentFile(document.uri);

    this.extractTypesAndFunctionsFromDocument(document);

    return this.validateWithCompiler(document);
  }

  private extractTypesAndFunctionsFromDocument(document: TextDocument): void {
    const vars = this.variables.get(document.uri);
    const funcs = this.functions.get(document.uri);
    const types = this.types.get(document.uri);
    const classes = this.classes.get(document.uri);
    const imports = this.imports.get(document.uri);
    if (vars) vars.clear();
    if (funcs) funcs.clear();
    if (types) types.clear();
    if (classes) classes.clear();
    if (imports) imports.length = 0;

    const text = document.getText();

    const importRegex = /import\s+["']([^"']+)["']/g;
    let match;

    while ((match = importRegex.exec(text)) !== null) {
      const importPath = match[1];
      this.addImport(importPath);
    }

    const typeRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{([^}]*)\}/g;
    while ((match = typeRegex.exec(text)) !== null) {
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

      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = { start: startPos, end: endPos };

      this.addType(typeName, fields, range);
    }

    const functionRegex =
      /fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)(?:\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*\{/g;

    while ((match = functionRegex.exec(text)) !== null) {
      const functionName = match[1];
      const paramsText = match[2].trim();
      const returnType = match[3] || '';
      const params: Parameter[] = [];

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

      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = { start: startPos, end: endPos };

      this.addFunction(
        functionName,
        {
          parameters: params,
          returnType,
        },
        range
      );
    }

    const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{([^}]*)\}/gs;

    while ((match = classRegex.exec(text)) !== null) {
      const className = match[1];
      const classBody = match[2];

      const classStartPos = document.positionAt(match.index);
      const classEndPos = document.positionAt(match.index + match[0].length);
      const classRange = { start: classStartPos, end: classEndPos };

      const methodRegex =
        /fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)(?:\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*\{/g;
      let methodMatch;
      const methods = new Map<string, ClassMethod>();

      while ((methodMatch = methodRegex.exec(classBody)) !== null) {
        const methodName = methodMatch[1];
        const paramsText = methodMatch[2].trim();
        const returnType = methodMatch[3] || '';
        const params: Parameter[] = [];

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

        methods.set(methodName, {
          parameters: params,
          returnType,
          className,
        });
      }

      this.addClass(className, methods, classRange);
    }

    const varRegex =
      /(var|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*=\s*(.+?)(?:[;\n,]|$)/g;

    while ((match = varRegex.exec(text)) !== null) {
      const isConst = match[1] === 'const';
      const varName = match[2];
      const declaredType = match[3] || '';
      const varValue = match[4].trim();

      let inferredType = '';
      if (varValue === 'true' || varValue === 'false') {
        inferredType = 'bool';
      } else if (varValue.startsWith('"') && varValue.endsWith('"')) {
        inferredType = 'string';
      } else if (/^-?\d+$/.test(varValue)) {
        inferredType = 'int';
      } else if (/^-?\d+\.\d+$/.test(varValue)) {
        inferredType = 'float';
      } else if (varValue === 'nil') {
        inferredType = 'nil';
      } else {
        const functionCallMatch = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(varValue);
        if (functionCallMatch) {
          const calledFunction = functionCallMatch[1];
          if (calledFunction === 'input') {
            inferredType = 'string';
          } else {
            const functionType = this.getFunction(calledFunction);
            if (functionType?.returnType) {
              inferredType = functionType.returnType;
            }
          }
        }
      }

      const finalType = declaredType || inferredType;

      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = { start: startPos, end: endPos };

      this.addVariable(varName, finalType, range, isConst);
    }
  }

  private validateWithCompiler(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    try {
      const tempFilePath = getTempFilePath(document.uri);
      fs.writeFileSync(tempFilePath, document.getText(), 'utf8');

      try {
        execSync(`${this.compilerPath} -c "${tempFilePath}"`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (error) {
        if (error instanceof Error) {
          let errorOutput = '';

          if ('stderr' in error) {
            errorOutput = (error as unknown as { stderr: string }).stderr;
          }
          if ('stdout' in error) {
            errorOutput += (error as unknown as { stdout: string }).stdout;
          }

          this.parseCompilerErrors(errorOutput, diagnostics, document);
        }
      } finally {
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (e) {
          console.error('Error removing temporary file:', e);
        }
      }
    } catch (error) {
      console.error('Error validating document with compiler:', error);
    }

    return diagnostics;
  }

  private parseCompilerErrors(
    output: string,
    diagnostics: Diagnostic[],
    document: TextDocument
  ): void {
    const errorRegex = /(lexical|syntax|type|runtime) error at line (\d+), column (\d+): (.+)/g;
    const tokenErrorRegex = /unexpected token '(.+)' at line (\d+), column (\d+)/g;
    const undefinedVarRegex = /undefined variable '(.+)' at line (\d+), column (\d+)/g;
    const typeErrorRegex =
      /type mismatch: expected '(.+)', got '(.+)' at line (\d+), column (\d+)/g;

    let match;

    while ((match = errorRegex.exec(output)) !== null) {
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

    while ((match = tokenErrorRegex.exec(output)) !== null) {
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

    while ((match = undefinedVarRegex.exec(output)) !== null) {
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

    while ((match = typeErrorRegex.exec(output)) !== null) {
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

    if (diagnostics.length === 0 && output.trim().length > 0) {
      const genericErrorMatch = /error:?\s+(.+)/i.exec(output);
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
    while (endCol < lineText.length && /[a-zA-Z0-9_]/.test(lineText.charAt(endCol))) {
      endCol++;
    }

    return Math.max(1, endCol - column);
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
}
