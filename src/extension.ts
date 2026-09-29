import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

function burnPath(): string {
  return vscode.workspace.getConfiguration('burn').get<string>('path') ?? 'burn';
}

function startClient(context: vscode.ExtensionContext): void {
  const command = burnPath();
  const serverOptions: ServerOptions = {
    run: { command, args: ['lsp'] },
    debug: { command, args: ['lsp'] },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'burn' },
      { scheme: 'untitled', language: 'burn' },
    ],
    synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher('**/*.bn') },
  };
  client = new LanguageClient('burn', 'Burn Language Server', serverOptions, clientOptions);
  client.start().catch((err: unknown) => {
    const reason = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(
      `Could not start the Burn language server (${command} lsp): ${reason}. Set "burn.path" to your burn executable.`
    );
  });
  context.subscriptions.push({ dispose: () => void client?.stop() });
}

function runInTerminal(args: string[]): void {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId !== 'burn') {
    void vscode.window.showWarningMessage('Open a .bn file first.');
    return;
  }
  void editor.document.save().then(() => {
    const terminal =
      vscode.window.terminals.find(t => t.name === 'Burn') ?? vscode.window.createTerminal('Burn');
    terminal.show(true);
    terminal.sendText(
      `${JSON.stringify(burnPath())} ${args.join(' ')} ${JSON.stringify(editor.document.fileName)}`
    );
  });
}

export function activate(context: vscode.ExtensionContext): void {
  startClient(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('burn.run', () => {
      runInTerminal(['run']);
    }),
    vscode.commands.registerCommand('burn.runNative', () => {
      runInTerminal(['run', '--native']);
    }),
    vscode.commands.registerCommand('burn.build', () => {
      runInTerminal(['build']);
    }),
    vscode.commands.registerCommand('burn.restartServer', async () => {
      await client?.stop();
      startClient(context);
      void vscode.window.showInformationMessage('Burn language server restarted');
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
