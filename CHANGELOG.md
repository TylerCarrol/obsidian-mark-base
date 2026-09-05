# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-09-05

### Fixed

- Lint warnings

## [0.3.0] - 2026-09-05

### Added

- New "Export" settings group in the Freeform view with a "Show export button" toggle that displays an export button at the top of the view.
- Added default export folder and file options. The folder option suggests
  folders that already exist in the vault.
- Added an "Export type" dropdown with Markdown as the initial format.
- Added export toggles for stripping YAML frontmatter, comments, and links,
  and for trimming trailing and leading whitespace.
- Added an export toggle that creates a separate output file for each group.
- Added an option to open the exported file in a new tab after export.
- Added an "Allow overrides" option that can bypass the export popup and export
  immediately with the configured settings.
- New `file.contents` Freeform property that renders a note's Markdown content
  wherever it appears in the property order, plus a `{{file.contents}}`
  template placeholder for explicit placement.

### Changed

- Escaped newlines in formula values are now preserved in Freeform previews and
  exports, including at entry boundaries when whitespace trimming is enabled.
- Whitespace trimming now removes blank lines at the beginning and end of each
  included Markdown file before composing the preview or export.
- The Freeform export button now opens a modal for temporary setting overrides
  and writes Markdown exports to the configured vault destination.
- The Freeform preview now applies the selected export cleanup options and
  displays grouped exports as separate output sections.
- Comment cleanup removes entire affected lines so comments do not leave blank
  lines in the preview or exported Markdown.

## [0.2.2] - 2026-09-03

### Changed

- Fixed Funding URL

## [0.2.1] - 2026-09-02

### Added

- Funding URL

## [0.2.0] - 2026-08-09

### Changed

- Removed unused sample settings code and simplified plugin startup.
- Updated the README with clearer usage and development instructions.

### Fixed

- Aligned Freeform view class names and data attributes with the plugin styles.

## [0.1.0] - 2026-08-09

### Added

- Initial Freeform Bases view with Markdown templates, property and formula
  placeholders, configurable separators, and demo vault content.

[Unreleased]: https://github.com/TylerCarrol/obsidian-mark-base/compare/v0.3.1...HEAD

[0.3.1]: https://github.com/TylerCarrol/obsidian-mark-base/compare/v0.3.0...v0.3.1

[0.3.0]: https://github.com/TylerCarrol/obsidian-mark-base/compare/v0.2.2...v0.3.0

[0.2.2]: https://github.com/TylerCarrol/obsidian-mark-base/compare/v0.2.1...v0.2.2

[0.2.1]: https://github.com/TylerCarrol/obsidian-mark-base/compare/v0.2.0...v0.2.1

[0.2.0]: https://github.com/TylerCarrol/obsidian-mark-base/compare/v0.1.0...v0.2.0

[0.1.0]: https://github.com/TylerCarrol/obsidian-mark-base/releases/tag/v0.1.0
