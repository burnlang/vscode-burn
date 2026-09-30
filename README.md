<p align="center">
    <img src="images/icon.png" alt="Burn logo" width="128">
</p>

# Burn Language Support for VS Code

Language support for [Burn](https://github.com/burnlang/burn).

## Features

- Syntax highlighting for `.bn` files, including `def type`, `def struct` (also `abstract` and `static`), `def interface`, `def enum`, `new`, `destroy` and string templates
- Live diagnostics from the real Burn compiler with exact line and column
- Hover with inferred types and signatures
- Completion for locals, globals, types, built-ins and members after `.`
- Go to definition, including into imported files
- Document outline and formatting
- Snippets for common constructs
- Commands: **Burn: Run Current File**, **Burn: Compile and Run Current File Natively**, **Burn: Build Executable**, **Burn: Restart Language Server**

## Requirements

The extension is a thin client for the language server built into the `burn` binary (`burn lsp`), so
diagnostics always match the compiler. Install the Burn toolchain and make sure `burn` is on your `PATH`, or set
`burn.path` in the settings:

```sh
curl -fsSL https://raw.githubusercontent.com/burnlang/burn/master/install.sh | sh
```

- Visual Studio Code 1.82.0 or newer
- Burn with the built-in language server (`burn lsp`)

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `burn.path` | `burn` | path to the burn executable |
| `burn.trace.server` | `off` | trace the communication with the language server |

## Development

```sh
npm install
npm run compile
npx vsce package
code --install-extension burn-language-server-26.1.0.vsix
```

Press `F5` in VS Code to start an Extension Development Host.

## License

GNU General Public License v3.0 - see [LICENSE](LICENSE).
