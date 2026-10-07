import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { execFile } from 'child_process';

export interface ReloadHost {
  burnHome(): string;
  env(): NodeJS.ProcessEnv;
  restart(): Promise<void>;
  output: vscode.OutputChannel;
}

function ashPath(home: string): string {
  const configured = vscode.workspace.getConfiguration('burn').get<string>('ashPath');
  if (configured && configured !== 'ash') {
    return configured;
  }
  const exe = process.platform === 'win32' ? 'ash.exe' : 'ash';
  const installed = path.join(home, 'bin', exe);
  return fs.existsSync(installed) ? installed : 'ash';
}

export function findProjectRoot(start: string | undefined): string | undefined {
  let dir = start;
  while (dir !== undefined) {
    if (fs.existsSync(path.join(dir, 'burn.toml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    dir = parent === dir ? undefined : parent;
  }
  return undefined;
}

function projectName(root: string): string {
  try {
    const text = fs.readFileSync(path.join(root, 'burn.toml'), 'utf8');
    const m = /^\s*name\s*=\s*"([^"]+)"/m.exec(text);
    return m ? m[1] : path.basename(root);
  } catch {
    return path.basename(root);
  }
}

export class ProjectReloader {
  private readonly item: vscode.StatusBarItem;
  private readonly changed = new Set<string>();
  private running = false;

  constructor(private readonly host: ReloadHost) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    this.item.command = 'burn.reloadProject';
    this.item.text = '$(sync) Reload Burn project';
    this.item.tooltip = 'burn.toml changed: run ash sync and reload the project';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  watch(context: vscode.ExtensionContext): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/burn.toml');
    const onChange = (uri: vscode.Uri): void => {
      void this.manifestChanged(path.dirname(uri.fsPath));
    };
    context.subscriptions.push(
      this.item,
      watcher,
      watcher.onDidChange(onChange),
      watcher.onDidCreate(onChange)
    );
  }

  private async manifestChanged(root: string): Promise<void> {
    if (this.running) {
      return;
    }
    const mode = vscode.workspace.getConfiguration('burn').get<string>('reload.onChange', 'ask');
    if (mode === 'never') {
      return;
    }
    if (mode === 'always') {
      await this.reload(root);
      return;
    }
    if (this.changed.has(root)) {
      return;
    }
    this.changed.add(root);
    this.item.show();
    const choice = await vscode.window.showInformationMessage(
      `burn.toml of ${projectName(root)} changed. Reload the project to install its packages?`,
      'Reload',
      'Always Reload'
    );
    if (choice === 'Always Reload') {
      await vscode.workspace
        .getConfiguration('burn')
        .update('reload.onChange', 'always', vscode.ConfigurationTarget.Global);
    }
    if (choice !== undefined) {
      await this.reload(root);
    }
  }

  private pickRoot(hint?: vscode.Uri): string | undefined {
    const fromHint = hint ? findProjectRoot(path.dirname(hint.fsPath)) : undefined;
    if (fromHint) {
      return fromHint;
    }
    const editor = vscode.window.activeTextEditor;
    const fromEditor = editor
      ? findProjectRoot(path.dirname(editor.document.uri.fsPath))
      : undefined;
    if (fromEditor) {
      return fromEditor;
    }
    const pending = this.changed.values().next();
    if (!pending.done) {
      return pending.value;
    }
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const root = findProjectRoot(folder.uri.fsPath);
      if (root) {
        return root;
      }
    }
    return undefined;
  }

  async reload(rootOrUri?: string | vscode.Uri): Promise<void> {
    const root = typeof rootOrUri === 'string' ? rootOrUri : this.pickRoot(rootOrUri);
    if (root === undefined) {
      void vscode.window.showWarningMessage(
        'Burn: no burn.toml found, so there is no project to reload.'
      );
      return;
    }
    if (this.running) {
      return;
    }
    this.running = true;
    const ash = ashPath(this.host.burnHome());
    const env = { ...this.host.env() };
    env.NO_COLOR = '1';
    const out = this.host.output;
    out.appendLine(`> ${ash} sync   (in ${root})`);
    try {
      const ok = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Burn: reloading ${projectName(root)} (ash sync)`,
        },
        () =>
          new Promise<boolean>(resolve => {
            execFile(ash, ['sync'], { cwd: root, env }, (err, stdout, stderr) => {
              out.append(stdout);
              out.append(stderr);
              if (err) {
                const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
                out.appendLine(
                  missing
                    ? `ash was not found at ${ash}. Install it with burnup or set "burn.ashPath".`
                    : err.message
                );
              }
              resolve(!err);
            });
          })
      );
      if (ok) {
        this.changed.delete(root);
        if (this.changed.size === 0) {
          this.item.hide();
        }
        await this.host.restart();
        vscode.window.setStatusBarMessage(`$(check) Burn: reloaded ${projectName(root)}`, 4000);
      } else {
        const choice = await vscode.window.showErrorMessage(
          `Burn: ash sync failed for ${projectName(root)}.`,
          'Show Output'
        );
        if (choice === 'Show Output') {
          out.show(true);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
