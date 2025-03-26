// src/typechecker.ts - Type tracking and validation
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

export interface Parameter {
  name: string;
  type: string;
}

export interface FunctionType {
  parameters: Parameter[];
  returnType: string;
}

export class BurnTypeTracker {
  private variables = new Map<string, Map<string, string>>();
  private functions = new Map<string, Map<string, FunctionType>>();
  private types = new Map<string, Map<string, Map<string, string>>>();
  private currentFile = '';

  constructor() {
    this.initializeBuiltins();
  }

  public getVariables(uri: string): Map<string, string> | undefined {
    return this.variables.get(uri);
  }

  private initializeBuiltins(): Map<string, FunctionType> {
    const builtinFunctions = new Map<string, FunctionType>();

    builtinFunctions.set('print', {
      parameters: [{ name: 'value', type: 'any' }],
      returnType: '',
    });

    builtinFunctions.set('toString', {
      parameters: [{ name: 'value', type: 'any' }],
      returnType: 'string',
    });

    builtinFunctions.set('input', {
      parameters: [{ name: 'prompt', type: 'string' }],
      returnType: 'string',
    });

    builtinFunctions.set('power', {
      parameters: [
        { name: 'base', type: 'int' },
        { name: 'exp', type: 'int' },
      ],
      returnType: 'int',
    });

    builtinFunctions.set('isEven', {
      parameters: [{ name: 'num', type: 'int' }],
      returnType: 'bool',
    });

    builtinFunctions.set('join', {
      parameters: [
        { name: 'str1', type: 'string' },
        { name: 'str2', type: 'string' },
        { name: 'separator', type: 'string' },
      ],
      returnType: 'string',
    });

    return builtinFunctions;
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
  }

  public addVariable(name: string, type: string): void {
    const vars = this.variables.get(this.currentFile);
    if (vars) {
      vars.set(name, type);
    }
  }

  public addFunction(name: string, functionType: FunctionType): void {
    const funcs = this.functions.get(this.currentFile);
    if (funcs) {
      funcs.set(name, functionType);
    }
  }

  public addType(typeName: string, fields: Map<string, string>): void {
    const types = this.types.get(this.currentFile);
    if (types) {
      types.set(typeName, fields);
    }
  }

  public getVariableType(name: string): string | undefined {
    const vars = this.variables.get(this.currentFile);
    return vars?.get(name);
  }

  public getFunction(name: string): FunctionType | undefined {
    // Try to find in the current file
    const funcs = this.functions.get(this.currentFile);
    const localFn = funcs?.get(name);
    if (localFn) return localFn;

    // Look for built-in functions
    if (
      name === 'print' ||
      name === 'toString' ||
      name === 'input' ||
      name === 'power' ||
      name === 'isEven' ||
      name === 'join'
    ) {
      const builtins = this.initializeBuiltins();
      return builtins.get(name);
    }

    // Look for functions in other files
    for (const [uri, funcMap] of this.functions.entries()) {
      if (uri !== this.currentFile) {
        const fn = funcMap.get(name);
        if (fn) return fn;
      }
    }
    return undefined;
  }

  public getType(typeName: string): Map<string, string> | undefined {
    // Look for the type in the current file
    const types = this.types.get(this.currentFile);
    const localType = types?.get(typeName);
    if (localType) return localType;

    // Look for the type in other files
    for (const [uri, typeMap] of this.types.entries()) {
      if (uri !== this.currentFile) {
        const type = typeMap.get(typeName);
        if (type) return type;
      }
    }
    return undefined;
  }

  public getAllFunctions(): [string, FunctionType][] {
    const result: [string, FunctionType][] = [];

    // Add built-in functions
    const builtins = this.initializeBuiltins();
    builtins.forEach((type, name) => {
      result.push([name, type]);
    });

    // Add functions from all files
    for (const [, funcMap] of this.functions.entries()) {
      funcMap.forEach((type, name) => {
        // Skip if already added
        if (!result.some(([n]) => n === name)) {
          result.push([name, type]);
        }
      });
    }

    return result;
  }

  public getAllTypes(): [string, Map<string, string>][] {
    const result: [string, Map<string, string>][] = [];

    // Built-in types
    const builtinTypes = new Map<string, Map<string, string>>();

    // Add int type
    const intType = new Map<string, string>();
    builtinTypes.set('int', intType);

    // Add float type
    const floatType = new Map<string, string>();
    builtinTypes.set('float', floatType);

    // Add string type
    const stringType = new Map<string, string>();
    builtinTypes.set('string', stringType);

    // Add bool type
    const boolType = new Map<string, string>();
    builtinTypes.set('bool', boolType);

    builtinTypes.forEach((fields, name) => {
      result.push([name, fields]);
    });

    // Add types from all files
    for (const [, typeMap] of this.types.entries()) {
      typeMap.forEach((fields, name) => {
        // Skip if already added
        if (!result.some(([n]) => n === name)) {
          result.push([name, fields]);
        }
      });
    }

    return result;
  }

  public parseDocument(document: TextDocument): Diagnostic[] {
    this.setCurrentFile(document.uri);

    // Clear existing data for this file
    const vars = this.variables.get(document.uri);
    const funcs = this.functions.get(document.uri);
    const types = this.types.get(document.uri);
    if (vars) vars.clear();
    if (funcs) funcs.clear();
    if (types) types.clear();

    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Process type definitions
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
          } else {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: document.positionAt(match.index),
                end: document.positionAt(match.index + match[0].length),
              },
              message: `Invalid field definition in type ${typeName}`,
              source: 'burn',
            });
          }
        }
      }

      this.addType(typeName, fields);
    }

    // Process function declarations
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
          } else {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: document.positionAt(match.index),
                end: document.positionAt(match.index + match[0].length),
              },
              message: `Invalid parameter definition in function ${functionName}`,
              source: 'burn',
            });
          }
        }
      }

      this.addFunction(functionName, {
        parameters: params,
        returnType,
      });
    }

    // Process variable declarations
    const varRegex =
      /(var|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*=\s*(.+?)(?:[;,]|$)/g;

    while ((match = varRegex.exec(text)) !== null) {
      const varName = match[2];
      let varType = match[3] || '';
      const varValue = match[4].trim();

      // Infer type from value if not explicitly specified
      if (!varType) {
        if (varValue === 'true' || varValue === 'false') {
          varType = 'bool';
        } else if (varValue.startsWith('"') && varValue.endsWith('"')) {
          varType = 'string';
        } else if (/^-?\d+$/.test(varValue)) {
          varType = 'int';
        } else if (/^-?\d+\.\d+$/.test(varValue)) {
          varType = 'float';
        } else {
          // Try to infer from function calls
          const functionCallMatch = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(varValue);
          if (functionCallMatch) {
            const calledFunction = functionCallMatch[1];
            const functionType = this.getFunction(calledFunction);
            if (functionType) {
              varType = functionType.returnType;
            }
          }
        }
      }

      this.addVariable(varName, varType);
    }

    return diagnostics;
  }
}
