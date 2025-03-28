import * as path from 'path';
import { Hover, HoverParams, MarkupKind, Range } from 'vscode-languageserver/node';
import { documents, typeTracker } from './server';

export function onHover(params: HoverParams): Hover | null {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  if (typeof typeTracker.setCurrentFile === 'function') {
    typeTracker.setCurrentFile(document.uri);
  }

  const position = params.position;
  const offset = document.offsetAt(position);
  const text = document.getText();

  const dotAccessInfo = checkForDotAccess(text, offset);
  if (dotAccessInfo) {
    const { objectName, propertyName } = dotAccessInfo;
    return getPropertyHover(objectName, propertyName);
  }

  const wordRange = getWordRangeAtPosition(text, offset);
  if (!wordRange) {
    return null;
  }

  const word = text.substring(wordRange.start, wordRange.end);

  const varType = typeTracker.getVariableType(word);
  if (varType) {
    let hoverContent = `**${word}**: \`${varType}\``;

    const typeInfo = typeTracker.getType(varType);
    if (typeInfo) {
      hoverContent += '\n\nFields:\n';
      typeInfo.forEach((fieldType, fieldName) => {
        hoverContent += `- \`${fieldName}: ${fieldType}\`\n`;
      });
    }

    const defLocation = typeTracker.getDefinitionLocation(word);
    if (
      defLocation &&
      typeof defLocation === 'object' &&
      'uri' in defLocation &&
      typeof defLocation.uri === 'string' &&
      'range' in defLocation
    ) {
      hoverContent += `\n\nDefined in [${path.basename(defLocation.uri)}](${defLocation.uri}) at line ${(defLocation.range.start.line + 1).toString()}`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: hoverContent,
      },
      range: convertToLspRange(wordRange),
    };
  }

  const func = typeTracker.getFunction(word);
  if (func) {
    const functionParams = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
    const returnInfo = func.returnType ? `: ${func.returnType}` : '';

    let hoverContent = `**${word}**(${functionParams})${returnInfo}\n\n`;

    hoverContent += `Function defined in this workspace.\n\n`;

    const exampleParams = func.parameters
      .map(p => {
        if (p.type === 'int' || p.type === 'float') return '0';
        if (p.type === 'string') return '"text"';
        if (p.type === 'bool') return 'true';
        return '...';
      })
      .join(', ');

    hoverContent += `\`\`\`burn\n${word}(${exampleParams})\n\`\`\``;

    const defLocation = typeTracker.getDefinitionLocation(word);
    if (
      defLocation &&
      typeof defLocation === 'object' &&
      'uri' in defLocation &&
      typeof defLocation.uri === 'string' &&
      'range' in defLocation
    ) {
      hoverContent += `\n\nDefined in [${path.basename(defLocation.uri)}](${defLocation.uri}) at line ${(defLocation.range.start.line + 1).toString()}`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: hoverContent,
      },
      range: convertToLspRange(wordRange),
    };
  }

  const type = typeTracker.getType(word);
  if (type) {
    let fieldsInfo = '';
    type.forEach((fieldType, fieldName) => {
      fieldsInfo += `- \`${fieldName}: ${fieldType}\`\n`;
    });

    let hoverContent = `**${word}**\n\nStruct type with fields:\n${fieldsInfo}`;

    hoverContent += `\n\n**Example usage:**\n\`\`\`burn\nvar obj: ${word} = {\n`;
    type.forEach((fieldType, fieldName) => {
      let defaultValue = '...';
      if (fieldType === 'int') defaultValue = '0';
      if (fieldType === 'float') defaultValue = '0.0';
      if (fieldType === 'string') defaultValue = '""';
      if (fieldType === 'bool') defaultValue = 'false';

      hoverContent += `    ${fieldName}: ${defaultValue},\n`;
    });
    hoverContent += `}\n\`\`\``;

    const defLocation = typeTracker.getDefinitionLocation(word);
    if (defLocation) {
      hoverContent += `\n\nDefined in [${path.basename(defLocation.uri)}](${defLocation.uri}) at line ${(defLocation.range.start.line + 1).toString()}`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: hoverContent,
      },
      range: convertToLspRange(wordRange),
    };
  }

  const classType = typeTracker.getType(word);
  if (
    classType &&
    typeof (typeTracker as { isClass?: (name: string) => boolean }).isClass?.(word) === 'boolean'
  ) {
    let methodsInfo = '';
    classType.forEach((methodType, methodName) => {
      if (typeof methodType === 'object' && 'parameters' in methodType) {
        interface MethodParameter {
          name: string;
          type: string;
        }

        const methodTypeObj = methodType as {
          parameters?: MethodParameter[];
          returnType?: string;
        };

        const paramList: string =
          methodTypeObj.parameters
            ?.map((p: MethodParameter) => `${p.name}: ${p.type}`)
            .join(', ') ?? '';
        const returnType = methodTypeObj.returnType ? `: ${methodTypeObj.returnType}` : '';
        methodsInfo += `- \`${methodName}(${paramList})${returnType}\`\n`;
      }
    });

    let hoverContent = `**${word}**\n\nClass with methods:\n${methodsInfo}`;

    const defLocation = typeTracker.getDefinitionLocation(word);
    if (defLocation) {
      hoverContent += `\n\nDefined in [${path.basename(defLocation.uri)}](${defLocation.uri}) at line ${(defLocation.range.start.line + 1).toString()}`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: hoverContent,
      },
      range: convertToLspRange(wordRange),
    };
  }

  const classMethods = typeTracker.getClassMethods(word);
  if (classMethods) {
    let methodsInfo = '';
    classMethods.forEach((methodType, methodName) => {
      const paramList = methodType.parameters.map(p => `${p.name}: ${p.type}`).join(', ') || '';
      const returnType = methodType.returnType ? `: ${methodType.returnType}` : '';
      methodsInfo += `- \`${methodName}(${paramList})${returnType}\`\n`;
    });

    let hoverContent = `**${word}**\n\nClass with methods:\n${methodsInfo}`;

    const defLocation = typeTracker.getDefinitionLocation(word);
    if (defLocation) {
      hoverContent += `\n\nDefined in [${path.basename(defLocation.uri)}](${defLocation.uri}) at line ${(defLocation.range.start.line + 1).toString()}`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: hoverContent,
      },
      range: convertToLspRange(wordRange),
    };
  }

  const builtinHover = getHoverForBuiltIn(word);
  if (builtinHover) {
    return {
      contents: builtinHover.contents,
      range: convertToLspRange(wordRange),
    };
  }

  return null;
}

function checkForDotAccess(
  text: string,
  offset: number
): { objectName: string; propertyName: string } | null {
  const lineStart = text.lastIndexOf('\n', offset) + 1;
  const lineEnd = text.indexOf('\n', offset);
  const currentLine = text.substring(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const posInLine = offset - lineStart;

  const dotPos = currentLine.lastIndexOf('.', posInLine);
  if (dotPos === -1) {
    return null;
  }

  const beforeDot = currentLine.substring(0, dotPos).trim();
  const objNameMatch = /([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(beforeDot);
  if (!objNameMatch) {
    return null;
  }

  const afterDot = currentLine.substring(dotPos + 1, posInLine).trim();
  const propNameMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)/.exec(afterDot);
  if (!propNameMatch) {
    return null;
  }

  return {
    objectName: objNameMatch[1],
    propertyName: propNameMatch[1],
  };
}

function getPropertyHover(objectName: string, propertyName: string): Hover | null {
  const objectType = typeTracker.getVariableType(objectName);
  if (!objectType) {
    return null;
  }

  const typeFields = typeTracker.getType(objectType);
  if (!typeFields) {
    return null;
  }

  const fieldType = typeFields.get(propertyName);
  if (!fieldType) {
    return null;
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**${propertyName}**: \`${fieldType}\`\n\nField of \`${objectType}\` type.`,
    },
  };
}

function getWordRangeAtPosition(
  text: string,
  offset: number
): { start: number; end: number } | null {
  if (offset >= text.length) {
    return null;
  }

  if (!/[a-zA-Z0-9_]/.test(text[offset])) {
    return null;
  }

  let start = offset;
  let end = offset;

  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) {
    start--;
  }

  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) {
    end++;
  }

  return { start, end };
}

function convertToLspRange(range: { start: number; end: number }): Range | undefined {
  const allDocs = documents.all();
  if (allDocs.length === 0) return undefined;
  const document = allDocs[0];

  const startPos = document.positionAt(range.start);
  const endPos = document.positionAt(range.end);

  return Range.create(startPos, endPos);
}

function getHoverForBuiltIn(word: string): Hover | null {
  const keywords: Record<string, string> = {
    fun: 'Declares a function.\n\n```burn\nfun functionName(param: type): returnType {\n    // function body\n}\n```',
    var: 'Declares a variable.\n\n```burn\nvar variableName = value\nvar variableName: type = value\n```',
    const:
      'Declares a constant (immutable variable).\n\n```burn\nconst CONSTANT_NAME = value\nconst CONSTANT_NAME: type = value\n```',
    def: 'Defines a new struct type.\n\n```burn\ndef TypeName {\n    field1: type1,\n    field2: type2\n}\n```',
    if: 'Conditional statement.\n\n```burn\nif (condition) {\n    // code to execute if condition is true\n} else {\n    // code to execute if condition is false\n}\n```',
    else: 'Alternative branch of a conditional statement.\n\n```burn\nif (condition) {\n    // code to execute if condition is true\n} else {\n    // code to execute if condition is false\n}\n```',
    while:
      'Loop that continues while a condition is true.\n\n```burn\nwhile (condition) {\n    // code to execute while condition is true\n}\n```',
    for: 'Loop with initialization, condition, and iteration steps.\n\n```burn\nfor (var i = 0; i < 10; i = i + 1) {\n    // code to execute in each iteration\n}\n```',
    return: 'Returns a value from a function.\n\n```burn\nreturn value;\n```',
    import:
      'Imports definitions from another file.\n\n```burn\nimport "path/to/file.bn"\n\n// Or multiple imports\nimport (\n    "path/to/file1.bn"\n    "path/to/file2.bn"\n)\n```',
    class:
      'Defines a class with methods.\n\n```burn\nclass ClassName {\n    fun methodName(param: type): returnType {\n        // method implementation\n    }\n}\n```',
    true: 'Boolean literal for true.',
    false: 'Boolean literal for false.',
  };

  const builtinFunctions: Record<string, string> = {
    print:
      '**print** - Prints a value to the console.\n\n**Signature:** `print(value: any): void`\n\n```burn\nprint("Hello, World!")\nprint(42)\nprint(true)\n```',
    toString:
      '**toString** - Converts a value to a string.\n\n**Signature:** `toString(value: any): string`\n\n```burn\nvar num = 42\nvar str = toString(num)  // "42"\n```',
    input:
      '**input** - Reads a line of input from the user.\n\n**Signature:** `input(prompt: string): string`\n\n```burn\nvar name = input("Enter your name: ")\nprint("Hello, " + name)\n```',
    power:
      '**power** - Calculates the power of a number.\n\n**Signature:** `power(base: int, exp: int): int`\n\n```burn\nvar result = power(2, 3)  // 8\n```',
    isEven:
      '**isEven** - Checks if a number is even.\n\n**Signature:** `isEven(num: int): bool`\n\n```burn\nvar even = isEven(4)  // true\n```',
    join: '**join** - Joins two strings with a separator.\n\n**Signature:** `join(str1: string, str2: string, separator: string): string`\n\n```burn\nvar result = join("Hello", "World", " ")  // "Hello World"\n```',
    now: '**now** - Returns the current date as a Date object.\n\n**Signature:** `now(): Date`\n\n```burn\nvar today = now()\nprint("Year: " + toString(today.year))\n```',
    formatDate:
      '**formatDate** - Formats a Date object as a string.\n\n**Signature:** `formatDate(date: Date): string`\n\n```burn\nvar today = now()\nvar formatted = formatDate(today)  // "2023-04-12"\n```',
    createDate:
      '**createDate** - Creates a new Date object.\n\n**Signature:** `createDate(year: int, month: int, day: int): Date`\n\n```burn\nvar birthday = createDate(1990, 5, 15)\n```',
    currentYear:
      '**currentYear** - Returns the current year.\n\n**Signature:** `currentYear(): int`',
    currentMonth:
      '**currentMonth** - Returns the current month.\n\n**Signature:** `currentMonth(): int`',
    currentDay: '**currentDay** - Returns the current day.\n\n**Signature:** `currentDay(): int`',
    addDays:
      '**addDays** - Adds days to a date.\n\n**Signature:** `addDays(date: Date, days: int): Date`',
    subtractDays:
      '**subtractDays** - Subtracts days from a date.\n\n**Signature:** `subtractDays(date: Date, days: int): Date`',
    isLeapYear:
      '**isLeapYear** - Checks if a year is a leap year.\n\n**Signature:** `isLeapYear(year: int): bool`',
    daysInMonth:
      '**daysInMonth** - Returns the number of days in a month.\n\n**Signature:** `daysInMonth(year: int, month: int): int`',
    dayOfWeek:
      '**dayOfWeek** - Returns the day of the week.\n\n**Signature:** `dayOfWeek(date: Date): int`',
  };

  const types: Record<string, string> = {
    int: '**int** - Integer number type.\n\n```burn\nvar age: int = 25\nvar count = 42  // Inferred as int\n```',
    float:
      '**float** - Floating-point number type.\n\n```burn\nvar pi: float = 3.14159\nvar temperature = 98.6  // Inferred as float\n```',
    string:
      '**string** - Text string type.\n\n```burn\nvar name: string = "John"\nvar greeting = "Hello"  // Inferred as string\n```',
    bool: '**bool** - Boolean type (true/false).\n\n```burn\nvar isValid: bool = true\nvar hasPermission = false  // Inferred as bool\n```',
    date: '**Date** - Date type with year, month, and day fields.\n\n```burn\nvar today = now()  // Returns a Date\nprint(today.year)  // Access year field\n```',
    time: '**Time** - Time type with hours, minutes, seconds, and milliseconds fields.\n\n```burn\nvar time = createTime(12, 30, 0, 0)  // Create a Time\nprint(time.hours)  // Access hours field\n```',
  };

  if (word in keywords) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}** - ${keywords[word]}`,
      },
    };
  }

  if (word in builtinFunctions) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: builtinFunctions[word],
      },
    };
  }

  if (word in types) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: types[word],
      },
    };
  }

  return null;
}

export function getErrorHover(errorMessage: string, range: Range): Hover {
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `⚠️ **Error**\n\n${errorMessage}`,
    },
    range,
  };
}
