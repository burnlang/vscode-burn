import {
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  InsertTextFormat,
  MarkupKind,
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

  const currentWord = getCurrentWord(lineText);

  const importMatch = /import\s+(?:"([^"]*)"|'([^']*)')?\s*$/.exec(lineText);
  if (importMatch) {
    return getImportCompletions();
  }

  const dotMatch = /([a-zA-Z_][a-zA-Z0-9_]*)\.\s*([a-zA-Z0-9_]*)$/.exec(lineText);
  if (dotMatch) {
    const objectName = dotMatch[1];
    const partialField = dotMatch[2] || '';

    return [
      ...getStructFieldCompletions(objectName, partialField),
      ...getClassMethodCompletions(objectName, partialField),
    ];
  }

  const textBeforeCursor = text.substring(0, offset);
  const contextLines = textBeforeCursor.split('\n').slice(-5).join('\n');

  const inFunctionParams = /fun\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*$/.test(contextLines);
  if (inFunctionParams) {
    if (lineText.includes(':') && !/\S+\s*:\s*\S+/.test(lineText)) {
      return getTypeCompletions();
    }
    if (/,\s*$/.test(lineText)) {
      return getParameterCompletions();
    }
  }

  const inTypeDefinition = /def\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\{[^}]*$/.test(contextLines);
  if (inTypeDefinition) {
    if (lineText.includes(':') && !/\S+\s*:\s*\S+/.test(lineText)) {
      return getTypeCompletions();
    }
  }

  return [
    ...getKeywordCompletions(currentWord),
    ...getTypeCompletions(),
    ...getFunctionCompletions(currentWord),
    ...getVariableCompletions(document.uri, currentWord),
    ...getConstantCompletions(document.uri, currentWord),
    ...getSnippetCompletions(currentWord),
    ...getBuiltInFunctionCompletions(currentWord),
  ];
}

function getCurrentWord(lineText: string): string {
  const match = /[a-zA-Z_][a-zA-Z0-9_]*$/.exec(lineText);
  return match ? match[0] : '';
}

function getKeywordCompletions(currentWord: string): CompletionItem[] {
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
    'class',
    'true',
    'false',
    'nil',
  ];

  return keywords
    .filter(kw => kw.startsWith(currentWord))
    .map(keyword => ({
      label: keyword,
      kind: CompletionItemKind.Keyword,
      data: `keyword-${keyword}`,
      sortText: `0-${keyword}`,
    }));
}

function getTypeCompletions(): CompletionItem[] {
  const primitiveTypes = [
    { name: 'int', description: 'Integer type (whole numbers)' },
    { name: 'float', description: 'Floating-point number type' },
    { name: 'string', description: 'Text string type' },
    { name: 'bool', description: 'Boolean type (true/false)' },
    { name: 'array', description: 'Array type' },
    { name: 'any', description: 'Any type (use with caution)' },
  ];

  const completions: CompletionItem[] = primitiveTypes.map(type => ({
    label: type.name,
    kind: CompletionItemKind.TypeParameter,
    data: `type-${type.name}`,
    documentation: {
      kind: MarkupKind.Markdown,
      value:
        `**${type.name}** - ${type.description}\n\n` + `\`\`\`burn\nvar name: ${type.name}\n\`\`\``,
    },
    sortText: `1-${type.name}`,
  }));

  typeTracker.getAllTypes().forEach(([typeName, fields]) => {
    if (!primitiveTypes.some(t => t.name === typeName)) {
      let fieldsDoc = '';
      fields.forEach((fieldType, fieldName) => {
        fieldsDoc += `- \`${fieldName}: ${fieldType}\`\n`;
      });

      completions.push({
        label: typeName,
        kind: CompletionItemKind.Class,
        data: `customtype-${typeName}`,
        detail: `Custom type with ${fields.size.toString()} fields`,
        documentation: {
          kind: MarkupKind.Markdown,
          value:
            `**${typeName}**\n\nFields:\n${fieldsDoc}\n\n` +
            `\`\`\`burn\nvar obj: ${typeName}\n\`\`\``,
        },
        sortText: `1-${typeName}`,
      });
    }
  });

  return completions;
}

function getFunctionCompletions(currentWord: string): CompletionItem[] {
  const completions: CompletionItem[] = [];

  typeTracker.getAllFunctions().forEach(([funcName, funcType]) => {
    if (funcName.startsWith(currentWord)) {
      const parameterList = funcType.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
      const returnInfo = funcType.returnType ? `: ${funcType.returnType}` : '';

      const paramSnippets = funcType.parameters.map(
        (p, i) => `\${${(i + 1).toString()}:${p.name}}`
      );

      completions.push({
        label: funcName,
        kind: CompletionItemKind.Function,
        data: `function-${funcName}`,
        detail: `fun ${funcName}(${parameterList})${returnInfo}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `\`\`\`burn\nfun ${funcName}(${parameterList})${returnInfo}\n\`\`\``,
        },
        insertText:
          funcType.parameters.length === 0
            ? `${funcName}()`
            : `${funcName}(${paramSnippets.join(', ')})`,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `2-${funcName}`,
      });
    }
  });

  return completions;
}

function getVariableCompletions(documentUri: string, currentWord: string): CompletionItem[] {
  const completions: CompletionItem[] = [];
  const vars = typeTracker.getVariables(documentUri);

  if (vars) {
    vars.forEach((varType, varName) => {
      if (varName.startsWith(currentWord)) {
        completions.push({
          label: varName,
          kind: CompletionItemKind.Variable,
          data: `variable-${varName}`,
          detail: `var ${varName}: ${varType}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Variable of type \`${varType}\``,
          },
          sortText: `3-${varName}`,
        });
      }
    });
  }

  return completions;
}

function getConstantCompletions(documentUri: string, currentWord: string): CompletionItem[] {
  const completions: CompletionItem[] = [];
  const constants =
    typeof typeTracker.getConstants === 'function'
      ? typeTracker.getConstants(documentUri)
      : new Map<string, string>();

  if (constants && constants instanceof Map) {
    interface ConstantCompletion {
      label: string;
      kind: CompletionItemKind;
      data: string;
      detail: string;
      documentation: {
        kind: MarkupKind;
        value: string;
      };
      sortText: string;
    }

    constants.forEach((constType: string, constName: string) => {
      if (constName.startsWith(currentWord)) {
        const completion: ConstantCompletion = {
          label: constName,
          kind: CompletionItemKind.Constant,
          data: `constant-${constName}`,
          detail: `const ${constName}: ${constType}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Constant of type \`${constType}\``,
          },
          sortText: `3-${constName}`,
        };
        completions.push(completion);
      }
    });
  }

  return completions;
}

function getStructFieldCompletions(objectName: string, partialField: string): CompletionItem[] {
  const completions: CompletionItem[] = [];
  const varType = typeTracker.getVariableType(objectName);

  if (varType) {
    const structType = typeTracker.getType(varType);
    if (structType) {
      structType.forEach((fieldType, fieldName) => {
        if (fieldName.startsWith(partialField)) {
          completions.push({
            label: fieldName,
            kind: CompletionItemKind.Field,
            detail: `${fieldName}: ${fieldType}`,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `Field of \`${varType}\` with type \`${fieldType}\``,
            },
            sortText: `1-${fieldName}`,
          });
        }
      });
    }
  }

  return completions;
}

function getClassMethodCompletions(className: string, partialMethod: string): CompletionItem[] {
  const completions: CompletionItem[] = [];
  const classMethods = typeTracker.getClassMethods(className);

  if (classMethods && classMethods instanceof Map) {
    classMethods.forEach((methodType, methodName: string) => {
      if (methodName.startsWith(partialMethod)) {
        interface Parameter {
          name: string;
          type: string;
        }

        interface MethodParameter {
          parameters: Parameter[];
        }

        const parameterList: string = (
          methodType as { parameters: { name: string; type: string }[] }
        ).parameters
          .map((p): string => `${p.name}: ${p.type}`)
          .join(', ');
        const returnInfo = (methodType as MethodType).returnType
          ? `: ${String((methodType as MethodType).returnType)}`
          : '';

        interface MethodParameter {
          name: string;
          type: string;
        }

        interface MethodType {
          parameters: MethodParameter[];
          returnType?: string;
        }
        const typedMethodType = methodType as MethodType;
        const paramSnippets: string[] = typedMethodType.parameters.map(
          (p: MethodParameter, i: number): string => `\${${(i + 1).toString()}:${p.name}}`
        );

        completions.push({
          label: methodName,
          kind: CompletionItemKind.Method,
          data: `method-${className}.${methodName}`,
          detail: `fun ${methodName}(${parameterList})${returnInfo}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value:
              `Method of class \`${className}\`\n\n` +
              `\`\`\`burn\nfun ${methodName}(${parameterList})${returnInfo}\n\`\`\``,
          },
          insertText:
            (methodType as MethodType).parameters.length === 0
              ? `${methodName}()`
              : `${methodName}(${paramSnippets.join(', ')})`,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: `2-${methodName}`,
        });
      }
    });
  }

  return completions;
}

function getBuiltInFunctionCompletions(currentWord: string): CompletionItem[] {
  const builtins = [
    {
      name: 'print',
      parameters: [{ name: 'value', type: 'any' }],
      returnType: '',
      description: 'Prints the value to the console.',
    },
    {
      name: 'toString',
      parameters: [{ name: 'value', type: 'any' }],
      returnType: 'string',
      description: 'Converts a value to a string representation.',
    },
    {
      name: 'input',
      parameters: [{ name: 'prompt', type: 'string' }],
      returnType: 'string',
      description: 'Reads a string from user input with an optional prompt.',
    },
    {
      name: 'now',
      parameters: [],
      returnType: 'Date',
      description: 'Returns the current date as a Date object.',
    },
    {
      name: 'formatDate',
      parameters: [{ name: 'date', type: 'Date' }],
      returnType: 'string',
      description: 'Formats a Date object as a string.',
    },
    {
      name: 'createDate',
      parameters: [
        { name: 'year', type: 'int' },
        { name: 'month', type: 'int' },
        { name: 'day', type: 'int' },
      ],
      returnType: 'Date',
      description: 'Creates a new Date object with the specified year, month, and day.',
    },
  ];

  return builtins
    .filter(b => b.name.startsWith(currentWord))
    .map(builtin => {
      const parameterList = builtin.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
      const returnInfo = builtin.returnType ? `: ${builtin.returnType}` : '';

      const paramSnippets = builtin.parameters.map((p, i) => `\${${(i + 1).toString()}:${p.name}}`);

      return {
        label: builtin.name,
        kind: CompletionItemKind.Function,
        data: `builtin-${builtin.name}`,
        detail: `${builtin.name}(${parameterList})${returnInfo}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value:
            `**${builtin.name}** - Built-in function\n\n${builtin.description}\n\n` +
            `\`\`\`burn\n${builtin.name}(${parameterList})${returnInfo}\n\`\`\``,
        },
        insertText:
          builtin.parameters.length === 0
            ? `${builtin.name}()`
            : `${builtin.name}(${paramSnippets.join(', ')})`,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `2-${builtin.name}`,
        tags: [CompletionItemTag.Deprecated],
      };
    });
}

function getSnippetCompletions(currentWord: string): CompletionItem[] {
  const snippets = [
    {
      label: 'fun',
      insertText: 'fun ${1:functionName}(${2:param}: ${3:type})${4:: ${5:returnType}} {\n\t${0}\n}',
      documentation: 'Creates a new function',
    },
    {
      label: 'def',
      insertText: 'def ${1:TypeName} {\n\t${2:fieldName}: ${3:type}${0}\n}',
      documentation: 'Defines a new type',
    },
    {
      label: 'class',
      insertText:
        'class ${1:ClassName} {\n\tfun ${2:methodName}(${3:param}: ${4:type})${5:: ${6:returnType}} {\n\t\t${0}\n\t}\n}',
      documentation: 'Creates a new class with a method',
    },
    {
      label: 'if',
      insertText: 'if (${1:condition}) {\n\t${0}\n}',
      documentation: 'Creates an if statement',
    },
    {
      label: 'ifelse',
      insertText: 'if (${1:condition}) {\n\t${2}\n} else {\n\t${0}\n}',
      documentation: 'Creates an if-else statement',
    },
    {
      label: 'for',
      insertText:
        'for (var ${1:i} = ${2:0}; ${1:i} < ${3:count}; ${1:i} = ${1:i} + 1) {\n\t${0}\n}',
      documentation: 'Creates a for loop',
    },
    {
      label: 'while',
      insertText: 'while (${1:condition}) {\n\t${0}\n}',
      documentation: 'Creates a while loop',
    },
    {
      label: 'import',
      insertText: 'import "${1:path}"',
      documentation: 'Imports a module',
    },
    {
      label: 'struct',
      insertText: '{\n\t${1:field1}: ${2:value1},\n\t${3:field2}: ${4:value2}${0}\n}',
      documentation: 'Creates a struct literal',
    },
  ];

  return snippets
    .filter(s => s.label.startsWith(currentWord))
    .map(snippet => ({
      label: snippet.label,
      kind: CompletionItemKind.Snippet,
      insertText: snippet.insertText,
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value:
          `**${snippet.label}** - ${snippet.documentation}\n\n` +
          `\`\`\`burn\n${snippet.insertText.replace(/\$\{\d+:([^}]*)\}/g, '$1')}\n\`\`\``,
      },
      sortText: `4-${snippet.label}`,
    }));
}

function getParameterCompletions(): CompletionItem[] {
  return [
    {
      label: 'param: type',
      kind: CompletionItemKind.Snippet,
      insertText: '${1:paramName}: ${2:type}',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: 'Parameter with type annotation',
      sortText: '0-param',
    },
  ];
}

function getImportCompletions(): CompletionItem[] {
  const stdLibs = [
    { path: 'date', description: 'Standard date library' },
    { path: 'time', description: 'Standard time library' },
  ];

  return stdLibs.map(lib => ({
    label: lib.path,
    kind: CompletionItemKind.Module,
    detail: `Standard library: ${lib.path}`,
    documentation: {
      kind: MarkupKind.Markdown,
      value: `${lib.description}\n\n` + `\`\`\`burn\nimport "${lib.path}"\n\`\`\``,
    },
    insertText: lib.path,
  }));
}

export function onCompletionResolve(item: CompletionItem): CompletionItem {
  if (typeof item.data === 'string') {
    if (item.data.startsWith('function-')) {
      const funcName = item.data.substring('function-'.length);
      item.documentation ??= {
        kind: MarkupKind.Markdown,
        value: `Function \`${funcName}\``,
      };
    } else if (item.data.startsWith('builtin-')) {
      const builtinName = item.data.substring('builtin-'.length);
      if (builtinName === 'print') {
        item.documentation = {
          kind: MarkupKind.Markdown,
          value:
            `**print** - Output a value to the console\n\n` +
            `\`\`\`burn\nprint("Hello, world!")\nprint(42)\nprint(true)\n\`\`\``,
        };
      }
    } else if (item.data.startsWith('keyword-')) {
      const keyword = item.data.substring('keyword-'.length);
      switch (keyword) {
        case 'fun':
          item.documentation = {
            kind: MarkupKind.Markdown,
            value:
              `**fun** - Define a function\n\n` +
              `\`\`\`burn\nfun add(a: int, b: int): int {\n  return a + b\n}\n\`\`\``,
          };
          break;
        case 'var':
          item.documentation = {
            kind: MarkupKind.Markdown,
            value:
              `**var** - Define a variable\n\n` +
              `\`\`\`burn\nvar name = "John"\nvar age: int = 25\n\`\`\``,
          };
          break;
        case 'const':
          item.documentation = {
            kind: MarkupKind.Markdown,
            value:
              `**const** - Define a constant\n\n` +
              `\`\`\`burn\nconst PI = 3.14159\nconst MAX_VALUE: int = 100\n\`\`\``,
          };
          break;
      }
    }
  }

  return item;
}
