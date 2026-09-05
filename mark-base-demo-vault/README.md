# MarkBase: Test Vault

This vault demonstrates the MarkBase **Freeform** Bases view.

Start with [[00 Start here]] for a quick live-demo script.

## Try the demo

1. Build and install the plugin into this vault:
   - On Windows, run `.\scripts\build-to-demo-vault.ps1` from the repository
     root.
   - On other platforms, run `npm run build`, then copy `main.js`,
     `manifest.json`, and `styles.css` to
     `.obsidian/plugins/mark-base/`.
2. Open this folder as an Obsidian vault.
3. Enable **Settings → Core plugins → Bases**.
4. Enable **Settings → Community plugins → MarkBase**.
5. Open **00 Start here** or go straight to **Freeform people.base**.

The **Profiles** view renders selected formulas from the sample notes in
`People/` as one Markdown document with separators between profiles.
The **Manuscript** Base renders chapter headings and the Markdown bodies of its
scene notes in sequence.

## Explore the example

- Reorder formulas in the Base properties menu and see the rendered values move
  in the same order.
- Edit a property in any note under `People/` and see the view update.
- Edit formulas such as `Byline`, `Years`, or `Quote` in
  **Freeform people.base**.
- Change **Configure view → Line separator**; use `\n\n` to add a blank line
  between property blocks.
- Change **Configure view → File separator**; use `\n` to add another line.
- Clear **Configure view → File separator** to remove the horizontal rule.
- Add `file.contents` in the Base properties menu and move it to where each
  note's body should render.
- Select `Templates/Person profile.md` under **Configure view → Template
  override** to try a fixed layout, then edit that file to see it update.

Without a template override, values render as Markdown in formula/property order.
The plugin does not add labels or formatting. The optional template demonstrates
how explicit placeholders can produce a consistent profile layout.
