/* eslint-disable @typescript-eslint/no-unsafe-return */
import { URI } from 'vscode-uri';

export function getPathFromURI(uri: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return URI.parse(uri).fsPath;
}
