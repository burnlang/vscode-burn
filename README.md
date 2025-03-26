<p align="center">
    <img src="https://github.com/S42yt/assets/blob/master/assets/burnlang/burn-logo.png" alt="Burn Logo">
</p>

# Burn Language Support for VS Code

This extension provides language support for the Burn programming language.

## Features

- Syntax highlighting for Burn language files (.bn)
- Auto-completion for keywords, types, and built-in functions
- Hover information for language elements
- Basic error detection for unbalanced delimiters
- Snippets for common code patterns

## Requirements

- Visual Studio Code 1.74.0 or newer

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Burn Language Support"
4. Click Install

### Manual Installation

1. Download the VSIX file from the releases page
2. In VS Code, go to Extensions (Ctrl+Shift+X)
3. Click on "..." at the top of the Extensions pane
4. Select "Install from VSIX..."
5. Choose the downloaded file

## Usage

The extension will automatically activate when you open any .bn file.

### Keyboard Shortcuts

- Code completion: Ctrl+Space
- Format document: Shift+Alt+F

## Extension Settings

This extension contributes the following settings:

* `burnLanguageServer.maxNumberOfProblems`: Controls the maximum number of problems reported by the server.

## Build from Source

1. Clone the repository
2. Navigate to the vscode directory
3. Run `npm install`
4. Run `npm run compile`
5. Press F5 to launch with debugging

## License

[MIT LICENSE](LICENSE)
