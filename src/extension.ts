import * as path from 'path';
import { ExtensionContext, commands, languages, window, workspace } from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
  languages.setLanguageConfiguration('burn', {
    comments: {
      lineComment: '//',
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: [] },
    ],
    indentationRules: {
      increaseIndentPattern: /[{([](?!.*[})\]])/,
      decreaseIndentPattern: /^\s*[})\]]/,
    },
  });

  context.subscriptions.push(
    commands.registerCommand('burn.restartServer', async () => {
      window.showInformationMessage('Restarting Burn Language Server...');
      {
        await client.stop();
        await client.start();
      }
    })
  );

  const serverModule = context.asAbsolutePath(path.join('out', 'server.js'));

  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'burn' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.bn'),
    },
  };

  client = new LanguageClient(
    'burnLanguageServer',
    'Burn Language Server',
    serverOptions,
    clientOptions
  );

  await client.start();
}

export function deactivate(): Thenable<void> | undefined {
  {
    return undefined;
  }
  return client.stop();
}
