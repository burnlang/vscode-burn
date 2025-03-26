import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { documents, typeTracker } from './server';

export function onCompletion(params: TextDocumentPositionParams): CompletionItem[] {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  if (typeof typeTracker.setCurrentFile === 'function') {
    typeTracker.setCurrentFile(document.uri);
  }

  const text = document.getText();
  const offset = document.offsetAt(params.position);
  const lineText = text.substring(text.lastIndexOf('\n', offset) + 1, offset);

  const dotMatch = /([a-zA-Z_][a-zA-Z0-9_]*)\.\s*$/.exec(lineText);
  if (dotMatch) {
    const objectName = dotMatch[1];
    const varType = typeTracker.getVariableType(objectName);

    if (varType) {
      const structType = typeTracker.getType(varType);
      if (structType) {
        const completions: CompletionItem[] = [];
        structType.forEach((fieldType, fieldName) => {
          completions.push({
            label: fieldName,
            kind: CompletionItemKind.Field,
            detail: fieldType,
            documentation: `Field of ${varType}`,
          });
        });
        return completions;
      }
    }
  }

  const completions: CompletionItem[] = [];

  const keywords = [
    'fun',
    'var',
    'const',
    'def',
    'if',
    'else',
    'for',
    'while',
    'return',
    'import',
    'true',
    'false',
  ];

  keywords.forEach((keyword, index) => {
    completions.push({
      label: keyword,
      kind: CompletionItemKind.Keyword,
      data: index + 1,
    });
  });

  const types = ['int', 'float', 'string', 'bool'];
  types.forEach(type => {
    completions.push({
      label: type,
      kind: CompletionItemKind.TypeParameter,
      data: `type-${type}`,
    });
  });

  typeTracker.getAllTypes().forEach(([typeName, fields]) => {
    if (!types.includes(typeName)) {
      completions.push({
        label: typeName,
        kind: CompletionItemKind.Class,
        data: `customtype-${typeName}`,
        detail: `Custom type with ${fields.size.toString()} fields`,
      });
    }
  });

  typeTracker.getAllFunctions().forEach(([funcName, funcType]) => {
    const parameterList = funcType.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
    const returnInfo = funcType.returnType ? `: ${funcType.returnType}` : '';

    completions.push({
      label: funcName,
      kind: CompletionItemKind.Function,
      data: `function-${funcName}`,
      detail: `fun ${funcName}(${parameterList})${returnInfo}`,
      insertText: `${funcName}(${funcType.parameters.map(() => '').join(', ')})`,
    });
  });

  const vars = typeTracker.getVariables(document.uri);
  if (vars) {
    vars.forEach((varType, varName) => {
      completions.push({
        label: varName,
        kind: CompletionItemKind.Variable,
        data: `variable-${varName}`,
        detail: varType,
      });
    });
  }

  return completions;
}

export function onCompletionResolve(item: CompletionItem): CompletionItem {
  if (item.data === 1) {
    item.detail = 'Function declaration';
    item.documentation =
      'Define a new function.\n\n```burn\nfun functionName(param: type): returnType {\n    // function body\n}\n```';
  } else if (item.data === 2) {
    item.detail = 'Variable declaration';
    item.documentation = 'Define a new variable.\n\n```burn\nvar variableName = value\n```';
  } else if (item.data === 3) {
    item.detail = 'Constant declaration';
    item.documentation = 'Define a new constant.\n\n```burn\nconst CONSTANT_NAME = value\n```';
  } else if (item.data === 4) {
    item.detail = 'Type definition';
    item.documentation =
      'Define a new struct type.\n\n```burn\ndef TypeName {\n    field1: type1,\n    field2: type2\n}\n```';
  } else if (typeof item.data === 'string') {
    if (item.data.startsWith('function-')) {
      const funcName = item.data.substring('function-'.length);
      if (funcName === 'print') {
        item.documentation =
          'Prints values to the console.\n\n```burn\nprint("Hello, world!")\n```';
      } else if (funcName === 'toString') {
        item.documentation =
          'Converts a value to a string.\n\n```burn\ntoString(42) // returns "42"\n```';
      } else if (funcName === 'input') {
        item.documentation =
          'Reads input from the user.\n\n```burn\nvar name = input("Enter your name: ")\n```';
      }
    } else if (item.data.startsWith('type-')) {
      const typeName = item.data.substring('type-'.length);
      if (typeName === 'int') {
        item.documentation = 'Integer number type\n\n```burn\nvar age: int = 25\n```';
      } else if (typeName === 'float') {
        item.documentation = 'Floating-point number type\n\n```burn\nvar pi: float = 3.14159\n```';
      } else if (typeName === 'string') {
        item.documentation = 'Text string type\n\n```burn\nvar name: string = "John"\n```';
      } else if (typeName === 'bool') {
        item.documentation = 'Boolean type (true/false)\n\n```burn\nvar isValid: bool = true\n```';
      }
    } else if (item.data.startsWith('customtype-')) {
      const typeName = item.data.substring('customtype-'.length);
      const type = typeTracker.getType(typeName);
      if (type) {
        let fieldsDoc = '';
        type.forEach((fieldType, fieldName) => {
          fieldsDoc += `- ${fieldName}: ${fieldType}\n`;
        });
        item.documentation = `Custom type ${typeName}\n\nFields:\n${fieldsDoc}`;
      }
    }
  }
  return item;
}
