import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import { execFile } from 'child_process';

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
  const started = client;
  client.start().then(
    () => {
      const caps = started.initializeResult?.capabilities;
      if (caps !== undefined && caps.documentLinkProvider === undefined) {
        void vscode.window.showWarningMessage(
          `The burn at ${command} is older than this extension, so completion while typing, clickable imports, auto-import and other features are missing. Update Burn with burnup or set "burn.path".`
        );
      }
    },
    (err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(
        `Could not start the Burn language server (${command} lsp): ${reason}. Set "burn.path" to your burn executable.`
      );
    }
  );
  context.subscriptions.push({ dispose: () => void client?.stop() });
}

function runBurn(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(burnPath(), args, { env: serverEnv() }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function sourcesRoot(): string {
  return path.join(burnHome(), 'cache', 'sources');
}

function isLibrarySource(file: string): boolean {
  const rel = path.relative(sourcesRoot(), file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function openLibrarySource(
  pick: (dir: string) => Promise<string | undefined>
): Promise<void> {
  try {
    const dir = await runBurn(['sources']);
    const file = await pick(dir);
    if (file !== undefined) {
      const doc = await vscode.workspace.openTextDocument(file);
      await vscode.window.showTextDocument(doc, { preview: true });
    }
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Could not open the Burn sources: ${reason}`);
  }
}

async function pickStdModule(dir: string): Promise<string | undefined> {
  const std = path.join(dir, 'std');
  const items = fs
    .readdirSync(std)
    .filter(f => f.endsWith('.bn'))
    .sort()
    .map(f => ({ label: `std/${f.slice(0, -3)}`, file: path.join(std, f) }));
  const chosen = await vscode.window.showQuickPick(items, {
    placeHolder: 'Standard library module to open',
  });
  return chosen?.file;
}

function runInTerminal(args: string[], uri?: vscode.Uri): void {
  const open = async (): Promise<vscode.TextDocument | undefined> => {
    if (uri !== undefined) {
      return vscode.workspace.openTextDocument(uri);
    }
    const editor = vscode.window.activeTextEditor;
    return editor?.document.languageId === 'burn' ? editor.document : undefined;
  };
  void open().then(async doc => {
    if (doc === undefined) {
      void vscode.window.showWarningMessage('Open a .bn file first.');
      return;
    }
    await doc.save();
    const terminal =
      vscode.window.terminals.find(t => t.name === 'Burn') ?? vscode.window.createTerminal('Burn');
    terminal.show(true);
    terminal.sendText(
      `${JSON.stringify(burnPath())} ${args.join(' ')} ${JSON.stringify(doc.fileName)}`
    );
  });
}

class MainCodeLens implements vscode.CodeLensProvider {
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    if (
      !vscode.workspace.getConfiguration('burn').get<boolean>('codeLens.run', true) ||
      isLibrarySource(doc.fileName)
    ) {
      return [];
    }
    const lenses: vscode.CodeLens[] = [];
    for (let i = 0; i < doc.lineCount; i++) {
      if (/^\s*(async\s+)?fun\s+main\s*\(/.test(doc.lineAt(i).text)) {
        const range = doc.lineAt(i).range;
        lenses.push(
          new vscode.CodeLens(range, {
            title: '$(play) Run',
            command: 'burn.run',
            arguments: [doc.uri],
          }),
          new vscode.CodeLens(range, {
            title: 'Run natively',
            command: 'burn.runNative',
            arguments: [doc.uri],
          }),
          new vscode.CodeLens(range, {
            title: 'Build',
            command: 'burn.build',
            arguments: [doc.uri],
          })
        );
      }
    }
    return lenses;
  }
}

function markReadOnly(editor: vscode.TextEditor | undefined): void {
  if (editor !== undefined && isLibrarySource(editor.document.fileName)) {
    void vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
  }
}

function createStatus(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'burn.restartServer';
  item.text = '$(flame) Burn';
  item.tooltip = 'Burn: restart the language server';
  void runBurn(['version']).then(
    v => {
      item.text = `$(flame) ${v}`;
      item.tooltip = `${v} (${burnPath()}): click to restart the language server`;
    },
    () => {
      item.text = '$(warning) Burn';
      item.tooltip =
        'The burn executable was not found. Set "burn.path" or install Burn with burnup.';
    }
  );
  const update = (editor: vscode.TextEditor | undefined): void => {
    if (editor?.document.languageId === 'burn') {
      item.show();
    } else {
      item.hide();
    }
  };
  update(vscode.window.activeTextEditor);
  context.subscriptions.push(item, vscode.window.onDidChangeActiveTextEditor(update));
}

export function activate(context: vscode.ExtensionContext): void {
  startClient(context);
  createStatus(context);
  markReadOnly(vscode.window.activeTextEditor);
  context.subscriptions.push(
    vscode.commands.registerCommand('burn.run', (uri?: vscode.Uri) => {
      runInTerminal(['run'], uri);
    }),
    vscode.commands.registerCommand('burn.runNative', (uri?: vscode.Uri) => {
      runInTerminal(['run', '--native'], uri);
    }),
    vscode.commands.registerCommand('burn.build', (uri?: vscode.Uri) => {
      runInTerminal(['build'], uri);
    }),
    vscode.commands.registerCommand('burn.openStdlib', () => openLibrarySource(pickStdModule)),
    vscode.commands.registerCommand('burn.openBuiltins', () =>
      openLibrarySource(dir => Promise.resolve(path.join(dir, 'builtins.bn')))
    ),
    vscode.languages.registerCodeLensProvider({ language: 'burn' }, new MainCodeLens()),
    vscode.window.onDidChangeActiveTextEditor(markReadOnly),
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
