import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  console.log('Burn language server is now active!');

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
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.bn'),
    },
  };

  client = new LanguageClient(
    'burnLanguageServer',
    'Burn Language Server',
    serverOptions,
    clientOptions
  );

  const compilerStatusCommand = vscode.commands.registerCommand('burn.checkCompilerStatus', () => {
    const config = vscode.workspace.getConfiguration('burnLanguageServer');
    const compilerPath = config.get<string>('compilerPath') ?? './burn.exe';

    void client.sendNotification('custom/checkCompilerStatus', { compilerPath });
  });

  const restartServerCommand = vscode.commands.registerCommand('burn.restartServer', async () => {
    await client.stop();
    vscode.window.showInformationMessage('Burn Language Server restarted');
  });

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(sync) Burn';
  statusBarItem.tooltip = 'Burn Language Server Status';
  statusBarItem.command = 'burn.checkCompilerStatus';
  statusBarItem.show();

  void client.start();

  context.subscriptions.push(client, compilerStatusCommand, restartServerCommand, statusBarItem);

  client.onNotification(
    'custom/compilerStatus',
    (params: { available: boolean; version: string }) => {
      if (params.available) {
        statusBarItem.text = `$(check) Burn ${params.version}`;
        statusBarItem.tooltip = `Burn compiler ${params.version} is available`;
      } else {
        statusBarItem.text = `$(warning) Burn`;
        statusBarItem.tooltip = `Burn compiler not found. Check settings.`;
      }
    }
  );
}

export function deactivate(): Thenable<void> {
  return client.stop();
}
