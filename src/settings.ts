// src/settings.ts - Settings management
import { connection, documentSettings, globalSettings, hasConfigurationCapability } from './server';

export interface BurnSettings {
  maxNumberOfProblems: number;
  compilerPath: string;
}

export const defaultSettings: BurnSettings = {
  maxNumberOfProblems: 100,
  compilerPath: 'burn',
};

export function getDocumentSettings(resource: string): Thenable<BurnSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'burnLanguageServer',
    });
    documentSettings.set(resource, result);
  }
  return result;
}
