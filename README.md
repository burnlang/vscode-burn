<p align="center">
    <img src="images/icon.png" alt="Burn logo" width="128">
</p>

# Burn Language Support for VS Code

Language support for [Burn](https://github.com/burnlang/burn).

## Features

- Syntax highlighting for `.bn` files, including definitions, generics, `match`, bit operators, sized number types and string templates
- Live diagnostics from the real Burn compiler with exact line and column, and quick fixes for the compiler's suggestions
- Completion for locals, globals, types, built-ins and members after `.`, with the documentation of built-in functions
- Signature help while you type the arguments of a call
- Inlay hints with the inferred type of `var` declarations and loop variables
- Hover with inferred types, signatures and documentation
- Go to definition, also into the standard library, the built-in functions (shown with their documentation) and the
  functions exported by `.bvmc` libraries
- Find all references and rename across the files of a project, including struct fields, enum variants and interface
  methods together with their implementations
- Highlights of the other uses of the name under the cursor, the document outline and workspace symbol search (`Ctrl+T`)
- Formatting with the built-in formatter
- **Run**, **Run natively** and **Build** above `fun main()`, and a run button in the editor title
- Commands: **Burn: Run Current File**, **Burn: Compile and Run Current File Natively**, **Burn: Build Executable**,
  **Burn: Open Standard Library Module...**, **Burn: Show Built-in Functions**, **Burn: Restart Language Server**
- The Burn version in the status bar; click it to restart the language server

Standard library modules and the built-in declarations are written by `burn sources` to
`~/.burn/cache/sources/<version>`. They open read-only.

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
