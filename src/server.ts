import { BurnSettings, defaultSettings } from './settings';
import { getAllBurnFiles, getBurnVersion, getPathFromURI } from './utils';
import { onCompletion, onCompletionResolve } from './completion';

import {
  DefinitionParams,
  Diagnostic,
  DidChangeConfigurationNotification,
  DocumentSymbolParams,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  SymbolKind,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from 'vscode-languageserver/node';
import { clearDiagnosticsCache, validateTextDocument } from './validator';
import { BurnTypeTracker } from './typechecker';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { onHover } from './hover';

const connection = createConnection(ProposedFeatures.all);
export { connection };
export const documents = new TextDocuments<TextDocument>(TextDocument);
export const typeTracker = new BurnTypeTracker();

export let hasConfigurationCapability = false;
export let hasWorkspaceFolderCapability = false;
export let hasDiagnosticRelatedInformationCapability = false;

export const documentSettings = new Map<string, Thenable<BurnSettings>>();
export let globalSettings: BurnSettings = defaultSettings;

export const diagnosticsCache = new Map<string, { version: number; diagnostics: Diagnostic[] }>();

let compilerPath = defaultSettings.compilerPath;

export function getCompilerPath(): string {
  return compilerPath;
}

async function updateCompilerPath(): Promise<string> {
  try {
    const config = (await connection.workspace.getConfiguration({
      section: 'burnLanguageServer',
    })) as { compilerPath?: string };

    if (config.compilerPath && typeof config.compilerPath === 'string') {
      compilerPath = config.compilerPath;
      typeTracker.setCompilerPath(compilerPath);
    }

    return compilerPath;
  } catch (error) {
    connection.console.error(`Error getting compiler path: ${String(error)}`);
    return compilerPath;
  }
}

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    const workspaceRoot = getPathFromURI(params.workspaceFolders[0].uri);
    typeTracker.setWorkspaceRoot(workspaceRoot);

    typeTracker.setCompilerPath(compilerPath);

    const files = getAllBurnFiles(workspaceRoot);
    connection.console.log(`Found ${files.length.toString()} Burn files in workspace`);

    Promise.all(
      files.map(file => {
        return new Promise<void>(resolve => {
          try {
            const uri = `file://${file}`;
            typeTracker.setCurrentFile(uri);
          } catch (error) {
            connection.console.error(`Error processing file ${file}: ${String(error)}`);
          } finally {
            resolve();
          }
        });
      })
    ).catch((err: unknown) => {
      connection.console.error(`Error processing workspace files: ${String(err)}`);
    });
  }

  hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);

  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  hasDiagnosticRelatedInformationCapability =
    !!capabilities.textDocument?.publishDiagnostics?.relatedInformation;

  updateCompilerPath().catch((error: unknown) => {
    connection.console.error(`Error updating compiler path: ${String(error)}`);
  });

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', ':'],
      },
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
      codeActionProvider: {
        codeActionKinds: ['quickfix'],
      },
      documentFormattingProvider: true,
    },
    serverInfo: {
      name: 'Burn Language Server',
      version: getBurnVersion(
        params.workspaceFolders?.[0]?.uri ? getPathFromURI(params.workspaceFolders[0].uri) : ''
      ),
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client
      .register(DidChangeConfigurationNotification.type, undefined)
      .catch((error: unknown) => {
        connection.console.error(`Failed to register configuration capability: ${String(error)}`);
      });
  }

  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(event => {
      connection.console.log('Workspace folder change event received.');

      for (const folder of event.added) {
        connection.console.log(`Added workspace folder: ${folder.uri}`);
        const workspaceRoot = getPathFromURI(folder.uri);

        const files = getAllBurnFiles(workspaceRoot);
        connection.console.log(`Found ${files.length.toString()} Burn files in added workspace`);
      }

      for (const folder of event.removed) {
        connection.console.log(`Removed workspace folder: ${folder.uri}`);
      }
    });
  }

  updateCompilerPath().catch((error: unknown) => {
    connection.console.error(`Error updating compiler path after initialization: ${String(error)}`);
  });
});

interface ConfigurationChangeEvent {
  settings: {
    burnLanguageServer?: BurnSettings;
  };
}

interface CodeActionEdit {
  changes: Record<
    string,
    {
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      newText: string;
    }[]
  >;
}

interface DocumentSymbol {
  name: string;
  kind: SymbolKind;
  location: {
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
}

interface TextEdit {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newText: string;
}

interface CodeAction {
  title: string;
  kind: string;
  edit: CodeActionEdit;
}

connection.onDidChangeConfiguration((change: ConfigurationChangeEvent) => {
  if (hasConfigurationCapability) {
    documentSettings.clear();
  } else {
    globalSettings = change.settings.burnLanguageServer ?? defaultSettings;
  }

  if (change.settings.burnLanguageServer?.compilerPath) {
    compilerPath = change.settings.burnLanguageServer.compilerPath;
    typeTracker.setCompilerPath(compilerPath);
    connection.console.log(`Updated compiler path to: ${compilerPath}`);
  }

  documents.all().forEach((document: TextDocument) => {
    validateTextDocument(document).catch((error: unknown) => {
      connection.console.error(`Error validating document: ${String(error)}`);
    });
  });
});

documents.onDidChangeContent((changeEvent: { document: TextDocument }) => {
  validateTextDocument(changeEvent.document).catch((error: unknown) => {
    connection.console.error(`Error validating document on change: ${String(error)}`);
  });
});

documents.onDidClose((e: { document: TextDocument }) => {
  documentSettings.delete(e.document.uri);
  clearDiagnosticsCache(e.document.uri);
  connection
    .sendDiagnostics({
      uri: e.document.uri,
      diagnostics: [],
    })
    .catch((error: unknown) => {
      connection.console.error(`Error clearing diagnostics: ${String(error)}`);
    });
});

connection.onHover(onHover);

connection.onDefinition((params: DefinitionParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  typeTracker.setCurrentFile(document.uri);

  const position = params.position;
  const offset: number = document.offsetAt(position);
  const text: string = document.getText();

  let start: number = offset;
  let end: number = offset;

  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) {
    start--;
  }

  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) {
    end++;
  }

  const word: string = text.substring(start, end);
  const location = typeTracker.getDefinitionLocation(word);

  if (location) {
    return {
      uri: location.uri,
      range: location.range,
    };
  }

  return null;
});

connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const symbols: DocumentSymbol[] = [];
  const text: string = document.getText();

  const functionRegex =
    /fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)(?:\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = functionRegex.exec(text)) !== null) {
    const name = match[1];
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    symbols.push({
      name,
      kind: SymbolKind.Function,
      location: {
        uri: document.uri,
        range: {
          start: startPos,
          end: endPos,
        },
      },
    });
  }

  const typeRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/g;

  while ((match = typeRegex.exec(text)) !== null) {
    const name = match[1];
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    symbols.push({
      name,
      kind: SymbolKind.Class,
      location: {
        uri: document.uri,
        range: {
          start: startPos,
          end: endPos,
        },
      },
    });
  }

  const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/g;

  while ((match = classRegex.exec(text)) !== null) {
    const name = match[1];
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    symbols.push({
      name,
      kind: SymbolKind.Class,
      location: {
        uri: document.uri,
        range: {
          start: startPos,
          end: endPos,
        },
      },
    });
  }

  const varRegex = /(var|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;

  while ((match = varRegex.exec(text)) !== null) {
    const name = match[2];
    const isConst = match[1] === 'const';
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);

    symbols.push({
      name,
      kind: isConst ? SymbolKind.Constant : SymbolKind.Variable,
      location: {
        uri: document.uri,
        range: {
          start: startPos,
          end: endPos,
        },
      },
    });
  }

  return symbols;
});

connection.onCompletion(onCompletion);
connection.onCompletionResolve(onCompletionResolve);

connection.onDocumentFormatting((params): TextEdit[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const text: string = document.getText();
  const lines: string[] = text.split(/\r?\n/);
  const edits: TextEdit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    if (line.trim() === '') {
      continue;
    }

    const fixedLine = line
      .replace(/([+\-*\/%=<>&|])(=?)([^ =])/g, '$1$2 $3')
      .replace(/([^ +\-*\/%=<>&|])([+\-*\/%=<>&|])(=?)/g, '$1 $2$3');

    if (fixedLine !== line) {
      edits.push({
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        newText: fixedLine,
      });
    }
  }

  return edits;
});

connection.onCodeAction((params): CodeAction[] => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const diagnostics = params.context.diagnostics;
    const codeActions: CodeAction[] = [];

    for (const diagnostic of diagnostics) {
      if (
        diagnostic.source === 'burn-semantics' &&
        diagnostic.message.includes('variable is used but not declared')
      ) {
        const match = /Variable '([^']+)' is used but not declared/.exec(diagnostic.message);
        if (match) {
          const varName = match[1];
          codeActions.push({
            title: `Declare variable '${varName}'`,
            kind: 'quickfix',
            edit: {
              changes: {
                [params.textDocument.uri]: [
                  {
                    range: {
                      start: { line: diagnostic.range.start.line, character: 0 },
                      end: { line: diagnostic.range.start.line, character: 0 },
                    },
                    newText: `var ${varName} = \n`,
                  },
                ],
              },
            },
          });
        }
      }

      if (diagnostic.source === 'burn-lint' && diagnostic.message.includes('never used')) {
        const match = /Variable '([^']+)' is declared but never used/.exec(diagnostic.message);
        if (match) {
          const varName = match[1];
          codeActions.push({
            title: `Add underscore to '${varName}'`,
            kind: 'quickfix',
            edit: {
              changes: {
                [params.textDocument.uri]: [
                  {
                    range: diagnostic.range,
                    newText: `var _${varName}`,
                  },
                ],
              },
            },
          });
        }
      }
    }

    return codeActions;
  } catch (error) {
    connection.console.error(`Error in code action handler: ${String(error)}`);
    return [];
  }
});

documents.listen(connection);
connection.listen();
