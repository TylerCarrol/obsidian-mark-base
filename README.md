# MarkBase for Obsidian

[![GitHub Release](https://img.shields.io/github/v/release/TylerCarrol/obsidian-mark-base?logo=github&sort=semver)](https://github.com/TylerCarrol/obsidian-mark-base/releases/latest) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/TylerCarrol/obsidian-mark-base/blob/main/LICENSE) [![Lint](https://github.com/TylerCarrol/obsidian-mark-base/actions/workflows/lint.yml/badge.svg)](https://github.com/TylerCarrol/obsidian-mark-base/actions/workflows/lint.yml) [![Test](https://github.com/TylerCarrol/obsidian-mark-base/actions/workflows/test.yml/badge.svg)](https://github.com/TylerCarrol/obsidian-mark-base/actions/workflows/test.yml)

## Requirements

- Obsidian 1.13.0 or later.
- The **Bases** core plugin must be enabled.

## Use the Freeform view

1. Open a Base and change its layout to **Freeform**.
2. Use the Base properties menu to choose and reorder the properties and
   formulas to render.
3. Open **Configure view → Line separator** to set the Markdown placed between
   properties inside each result. The default is `\n`. Enter `\n\n` for a
   blank line between blocks.
4. Open **Configure view → File separator** to set the Markdown placed between
   results. Enter `\n` for a new line, such as `---\n\n---`, or clear the
   option to join results without a separator.

Each selected value is rendered as Markdown, in property-menu order. Single
newlines in multiline formula values remain visible. `file.name` is rendered as
a link to its note. Changes to matching notes, formulas, property order, and
view options update the view automatically.

## Demo vault

The ready-made [`mark-base-demo-vault`](mark-base-demo-vault/README.md) includes
a Base, two sample notes, and a Freeform template.

## Install for development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the plugin:
   ```bash
   npm run build
   ```
3. Copy `main.js`, `manifest.json`, and `styles.css` to:
   ```text
   <Vault>/.obsidian/plugins/mark-base/
   ```
4. In Obsidian, enable **Settings → Community plugins → MarkBase**.

For watch mode during development:

```bash
npm run dev
```

## Fastest way to try it

This repository includes a ready-made demo vault in `/mark-base-demo-vault`.

- Windows/PowerShell:
  ```powershell
  .\scripts\build-to-demo-vault.ps1
  ```
- Any platform:
  1. Run `npm run build`
  2. Copy `main.js`, `manifest.json`, and `styles.css` to `mark-base-demo-vault/.obsidian/plugins/mark-base/`
  3. Open `mark-base-demo-vault` in Obsidian

See [`mark-base-demo-vault/README.md`](mark-base-demo-vault/README.md) for a
guided walkthrough.
