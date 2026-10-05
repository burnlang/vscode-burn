<p align="center">
    <img src="images/icon.png" alt="Burn logo" width="128">
</p>

# Burn Language Support for VS Code

Language support for [Burn](https://github.com/burnlang/burn).

## Features

- Syntax highlighting for `.bn` files, including `def` definitions and string templates
- Live diagnostics from the real Burn compiler with exact line and column
- Completion that keeps working while you type, for locals, globals, types, built-ins and members after `.`, with
  docs, parentheses and parameter hints
- Completion and quick fixes that add missing imports from the standard library and your project
- Hover with inferred types, signatures and documentation
- Clickable imports that open the module, including standard library modules
- Signature help for calls and inlay hints with inferred types
- Go to definition (also into the standard library, built-in functions and bytecode libraries), type definition and
  implementation
- Find all references, highlight references and rename across files
- Workspace symbols, an outline with struct members, folding, formatting, quick fixes and fix all
- Run, Run natively and Build links above `fun main`
- **Burn: Open Standard Library Module...** and **Burn: Show Built-in Functions** to read library sources

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
| `burn.codeLens.run` | `true` | show Run, Run natively and Build above `fun main()` |

## Development

```sh
npm install
npm run compile
npx vsce package
code --install-extension burn-language-server-26.2.0.vsix
```

Press `F5` in VS Code to start an Extension Development Host.

## License

GNU General Public License v3.0 - see [LICENSE](LICENSE).
