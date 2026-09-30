import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

function burnHome(): string {
  const home = process.env.BURN_HOME;
  return home !== undefined && home !== '' ? home : path.join(os.homedir(), '.burn');
}

function burnPath(): string {
  const configured = vscode.workspace.getConfiguration('burn').get<string>('path');
  if (configured && configured !== 'burn') {
    return configured;
  }
  const exe = process.platform === 'win32' ? 'burn.exe' : 'burn';
  const installed = path.join(burnHome(), 'bin', exe);
  return fs.existsSync(installed) ? installed : 'burn';
}

function serverEnv(): NodeJS.ProcessEnv {
  const bin = path.join(burnHome(), 'bin');
  const current = process.env.PATH ?? '';
  const parts = current.split(path.delimiter);
  const env = { ...process.env };
  env.PATH = parts.includes(bin) ? current : [bin, ...parts].join(path.delimiter);
  return env;
}

function startClient(context: vscode.ExtensionContext): void {
  const command = burnPath();
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const options = { env: serverEnv(), cwd };
  const serverOptions: ServerOptions = {
    run: { command, args: ['lsp'], options },
    debug: { command, args: ['lsp'], options },
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
