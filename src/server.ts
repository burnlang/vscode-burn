import { BurnSettings, defaultSettings } from './settings';
import {
  DidChangeConfigurationNotification,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from 'vscode-languageserver/node';
import { onCompletion, onCompletionResolve } from './completion';
import { BurnTypeTracker } from './typechecker';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { onHover } from './hover';
import { validateTextDocument } from './validator';

export const connection = createConnection(ProposedFeatures.all);
export const documents = new TextDocuments<TextDocument>(TextDocument);
export const typeTracker = new BurnTypeTracker();

export let hasConfigurationCapability = false;
export let hasWorkspaceFolderCapability = false;
export let hasDiagnosticRelatedInformationCapability = false;

export const documentSettings = new Map<string, Thenable<BurnSettings>>();
export let globalSettings: BurnSettings = defaultSettings;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability =
    !!capabilities.textDocument?.publishDiagnostics?.relatedInformation;

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.'],
      },
      hoverProvider: true,
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
    void connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(() => {
      connection.console.log('Workspace folder change event received.');
    });
  }
});

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    documentSettings.clear();
  } else {
    const settings = change.settings as { burnLanguageServer?: BurnSettings };
    globalSettings = settings.burnLanguageServer ?? defaultSettings;
  }

  void Promise.all(documents.all().map(validateTextDocument));
});

documents.onDidChangeContent(change => {
  void validateTextDocument(change.document);
});

documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
});

connection.onHover(onHover);
connection.onCompletion(onCompletion);
connection.onCompletionResolve(onCompletionResolve);

documents.listen(connection);
connection.listen();
