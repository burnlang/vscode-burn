import { Hover, HoverParams, MarkupKind } from 'vscode-languageserver/node';
import { documents, typeTracker } from './server';

export function onHover(params: HoverParams): Hover | null {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  typeTracker.setCurrentFile(document.uri);

  const position = params.position;
  const offset = document.offsetAt(position);
  const text = document.getText();

  const wordRange = getWordRangeAtPosition(text, offset);
  if (!wordRange) {
    return null;
  }

  const word = text.substring(wordRange.start, wordRange.end);

  const varType = typeTracker.getVariableType(word);
  if (varType) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}**: ${varType}`,
      },
    };
  }

  const func = typeTracker.getFunction(word);
  if (func) {
    const functionParams = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
    const returnInfo = func.returnType ? `: ${func.returnType}` : '';

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}**(${functionParams})${returnInfo}\n\nFunction defined in this workspace.`,
      },
    };
  }

  const type = typeTracker.getType(word);
  if (type) {
    let fieldsInfo = '';
    type.forEach((fieldType, fieldName) => {
      fieldsInfo += `- \`${fieldName}: ${fieldType}\`\n`;
    });

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}**\n\nStruct type with fields:\n${fieldsInfo}`,
      },
    };
  }

  const hover = getHoverForBuiltIn(word);
  if (hover) {
    return hover;
  }

  return null;
}

function getWordRangeAtPosition(
  text: string,
  offset: number
): { start: number; end: number } | null {
  let start = offset;
  let end = offset;

  if (offset >= text.length) {
    return null;
  }

  if (!/[a-zA-Z0-9_.]/.test(text[offset])) {
    return null;
  }

  while (start > 0 && /[a-zA-Z0-9_.]/.test(text[start - 1])) {
    start--;
  }

  while (end < text.length && /[a-zA-Z0-9_.]/.test(text[end])) {
    end++;
  }

  return { start, end };
}

function getHoverForBuiltIn(word: string): Hover | null {
  const keywords: Record<string, string> = {
    fun: 'Declares a function',
    var: 'Declares a variable',
    const: 'Declares a constant (immutable variable)',
    def: 'Defines a new type',
    if: 'Conditional statement',
    else: 'Alternative branch of a conditional statement',
    while: 'Loop that continues while a condition is true',
    for: 'Loop with initialization, condition, and iteration steps',
    return: 'Returns a value from a function',
    import: 'Imports definitions from another file',
    true: 'Boolean literal for true',
    false: 'Boolean literal for false',
  };

  const builtinFunctions: Record<string, string> = {
    print: 'Prints a value to the console.\n\n**Signature:** `print(value: any): void`',
    toString: 'Converts a value to a string.\n\n**Signature:** `toString(value: any): string`',
    input: 'Reads a line of input from the user.\n\n**Signature:** `input(prompt: string): string`',
    power: 'Calculates the power of a number.\n\n**Signature:** `power(base: int, exp: int): int`',
    isEven: 'Checks if a number is even.\n\n**Signature:** `isEven(num: int): bool`',
    join: 'Joins two strings with a separator.\n\n**Signature:** `join(str1: string, str2: string, separator: string): string`',
  };

  const types: Record<string, string> = {
    int: 'Integer number type',
    float: 'Floating-point number type',
    string: 'Text string type',
    bool: 'Boolean type (true/false)',
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
        value: `**${word}** - ${builtinFunctions[word]}`,
      },
    };
  }

  if (word in types) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}** - ${types[word]}`,
      },
    };
  }

  return null;
}
