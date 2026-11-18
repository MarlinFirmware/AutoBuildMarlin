# Auto Build Marlin - Agent Guide

## Project Overview

**Auto Build Marlin** is a Visual Studio Code extension providing a simplified interface to configure, build, and upload Marlin Firmware. It automates the PlatformIO build process and provides a custom configuration editor for Marlin's `Configuration.h` and `Configuration_adv.h` files.

### Key Features

- **Auto Build Panel**: Sidebar panel with Build, Upload, Debug, and Clean buttons for Marlin firmware
- **Configuration Editor**: Custom webview-based editor for Marlin configuration files with form-based editing
- **Board Detection**: Automatically detects MOTHERBOARD from pins.h and shows relevant build environments
- **PlatformIO Integration**: Interacts with PlatformIO IDE extension for building and uploading
- **Code Formatter**: Custom formatter for Marlin C++ code and pins files
- **Schema Export**: Export configuration schemas to JSON and YML formats

### Repository

- **GitHub**: https://github.com/MarlinFirmware/AutoBuildMarlin
- **VS Marketplace**: marlinfirmware.auto-build
- **Version**: 2.1.xx with frequent updates

## Project Structure
```
AutoBuildMarlin/           # VSCode Extension root
├── extension.js           # Entry point — registers commands, providers, inits abm module
├── package.json           # Extension manifest — activation events, views, commands, menus
├── README.md              # User documentation
├── CHANGELOG.md           # Version history
├── LICENSE                # License file
├── abm/
│   ├── abm.js             # Extension-side: main ABM panel logic (webview creation, messaging, PIO)
│   ├── abm.html           # Main panel HTML template — uses ${...} eval'd by abm.js
│   ├── editor.js          # Extension-side: Custom Editor provider for Configuration.h/_adv.h
│   ├── editor.html        # Config editor HTML template — uses ${...} eval'd by editor.js
│   ├── prefs.js           # Settings/preferences module
│   ├── docs.js            # Docs panel provider
│   ├── format.js          # C++ formatter for Marlin code
│   ├── js/
│   │   ├── marlin.js      # Data model — reads/parses Marlin config files, extracts board/version info
│   │   ├── schema.js      # ConfigSchema class — parses #define to structured dict (bysec/bysid)
│   │   ├── editview.js    # WebView-side: builds config editor form from schema, handles edits
│   │   ├── abmview.js     # WebView-side: main panel logic, handles extension messages
│   │   ├── vsview.js      # Provides _msg() helper using acquireVsCodeApi()
│   │   ├── grid.js        # Matrix screensaver easter egg (no-results animation)
│   │   ├── jstepper.js    # jQuery numerical stepper plugin
│   │   └── jquery-3.6.0.min.js
│   ├── pane/
│   │   ├── geom.html      # Geometry config pane (placeholder)
│   │   ├── lcd.html       # LCD config pane (placeholder)
│   │   └── sd.html        # SD config pane (placeholder)
│   ├── css/               # Stylesheets
│   └── img/               # Icons and images
├── resources/             # Extension-level resources (toolbar icons)
└── img/                   # Documentation images
```

## Agent Responsibilities

### For Any Agent Working on This Project

1. **Read the Code Before Making Changes**: All modules use plain JavaScript (not TypeScript). The extension runs in VS Code's extension host.

2. Contributes to VSCode via package.json
  - customEditors: Config Editor
  - viewsContainers: activitybar "Auto Build Marlin"
  - configuration: See abm/prefs.js
  - views: welcomeView, docsView
  - viewsWelcome: welcomeView (via state flags)
  - commands: Show ABM Panel, Build, Upload, Clean, Configure, Format Marlin Code, Export schema.json, Export schema.yml, Apply config.ini, Edit Configuration.h, Edit Configuration_adv.h
  - menus: actually, command buttons

3. **Key Modules**:
   - `extension.js`: Entrypoint to init the extension.
   - `abm/abm.js`: Provide the Build View and Commands like Build and Upload via PlatformIO in the VSCode terminal. Watch for changes.
   - `abm/marlin.js`: Helper that scrapes config files, pins.h, boards.h for abm.js
   - `abm/editor.js`: Custom Editor provider for Configuration files. Uses abm/js/schema.js for parsing.
   - `abm/format.js`: Code formatting for Marlin C++ and pins files. TODO: C++ indentation experiments with post-indentation based on preprocessor directives.
   - `abm/js/schema.js`: Configuration schema parsing for the webview editor

4. **Debugging**:
  a. Run the `abm-code` command from Terminal. (This opens the MarlinFirmware project in VSCode.)
  b. Use the Open command in VSCode to close the MarinFirmware project and open the AutoBuildMarlin project.
  c. Now, pressing the Run button in the VSCode Debug panel causes VSCode to open the MarlinFirmware folder in a separate window hosting our local AutoBuildMarlin extension.
TODO: Look into automated methods agents can use to debug VSCode extensions.

5. **Dependencies**: Relies on PlatformIO IDE extension being installed. jQuery 3.6.0 bundled locally.

### Build & Development

- No build step required - extension is pure JavaScript.
- After making edits, if VSCode is running it must reload extensions to get the changes.
- Activate by opening a Marlin Firmware workspace (contains `platformio.ini`)
- Extension triggers on `workspaceContains:/Marlin/Configuration.h`

### Related Projects

- The MarlinFirmware/Marlin project script buildroot/share/PlatformIO/scripts/schema.py is meant to keep parity with abm/js/schema.js
- Marlin Documentation being Jekyll, it may benefit from schema YAML export.

### Communication Guidelines

- All GitHub issues: https://github.com/MarlinFirmware/AutoBuildMarlin/issues
- Sponsor link: https://github.com/sponsors/MarlinFirmware

## Two Independent WebView Systems

There are **two distinct webview systems** that share no code:

### 1. Main ABM Panel (`abm.html` / `abmview.js`)

**Extension side** (`abm.js`):
- `create_webview_panel()` creates a `vscode.WebviewPanel` in `ViewColumn.One`
- The panel's `pv` (panel.webview) is a **global singleton** — only one ABM panel exists
- `webViewContent()` reads `abm.html` and evaluates `${...}` template variables using `eval` on a template literal
- `postMessage(msg)` sends to the webview via `pv.postMessage(msg)`
- `handleMessageFromUI(m)` receives messages from the webview
- Messages use `{ command: '...', ... }` format

**WebView side** (`abmview.js`):
- Singleton `ABM` object with `init()`, `handleMessageToUI(event)`
- `msg(m)` sends messages back to extension (via `_msg()` from vsview.js)
- `$('body').click(...)` hides error messages
- `.subtabs button` click triggers `abm_pane()` to show config sub-panes
- `#showy input` change events send commands to update settings
- Alt key toggles `.clean` buttons to `.purge`

**Panel lifecycle:**
- ABM Panel opens in response to a command such as `abm.show`
- Panel retains context when hidden (`retainContextWhenHidden: true`)
- On dispose: clears panel ref, restarts file watcher, stops build watcher, destroys IPC file
- On view state change: syncs checkbox states

**Panel data flow:**
- The ABM Panel use exported functions from module `js/marlin` to initiate loading and do simplified scraping of Marlin's config files, `boards.h`, `pins.h`, etc.…
  - Callbacks are provided for success (`allFilesAreLoaded`) and failure (`readFileError`)
- On success, when all files are loaded and buffered, it calls back to `allFilesAreLoaded`:
  - `allFilesAreLoaded` calls various `marlin.<export>` functions to scrape data from Marlin files as structured data
  - Build information is scraped from Marlin `pins/pins.h` and specific pins files
  - `allFilesAreLoaded` sends messages to the view
    - `handleMessageToUI` receives those messages in the view (`js/abmview.js`)
      updates the row values in the table, populates the build envs and buttons.

### 2. Config Editor (`editor.html` / `editview.js`)

**Extension side** (`editor.js`):
- `ConfigEditorProvider` implements `resolveCustomTextEditor()` (VSCode custom editor API)
- Each editor instance has its own closure with `my = { filename, adv, wv }`
- Maintains a `webviews` dict keyed by filename to support cross-file sync
- `reloadSchemas()` calls `combinedSchema()` from schema.js to parse both configs
- `initWebview()` sends `{ type: 'update', bysec: ... }` to the webview
- `updateWebview(external)` sends updates on external changes
- `applyConfigChange(document, changes, edit)` updates the document text (line by line edits)
- Messages use `{ type: 'change', data: { sid, enabled, value, line } }` format

**WebView side** (`editview.js`):
- `schema` is a local `ConfigSchema` instance
- `buildConfigForm()` iterates `schema.bysec` sections → creates `<fieldset>` per section → `<div class="line">` per item
- `addOptionLine(data, $inner)` renders each config option:
  - **switch** → checkbox only
  - **options** present → `<select>` dropdown
  - **type: state** → toggle-style checkbox (LOW/HIGH)
  - **type: bool** → toggle switch
  - **text/enum/int/float/string/char/array** → `<input type="text">`
  - comment as `<span>` with auto-link
- `commitChange(optref, fields)` → updates inforef, marks dirty, sends `{ type:'change' }` to extension
- Filter system hides lines by class and sections by visibility count

**Config schema** (`schema.js`):
- `ConfigSchema` class: `bysec` = dict keyed by section, `bysid` = array indexed by SID
- `importText(text)` parses `#define`, `#undef`, `#if`/`#ifdef`/`#ifndef`/`#else`/`#elif`/`#endif`
  - Tracks nested `#if` conditions in a `conditions` stack
  - Converts Marlin macros to JS eval equivalents (ENABLED→`ENABLED()`, MB→`MB()`, etc.)
- `requirement tracking`: items get a `requires` field (JS-evaluable expression), `evaled` boolean
- `refreshAllRequires()` re-evaluates all conditions
- `itemGroup(item)` maps item names to radio-button groups (LCDs, probes, kinematics, etc.)
- `combinedSchema()` in schema.js reads both configs + conditionals and produces two schemas

### Messaging Architecture Summary

| Direction | Format | Mechanism |
|-----------|--------|-----------|
| Panel: Extension → WebView | `{ command:'info', tag, val }` etc. | `pv.postMessage()` → `window.addEventListener('message', ...)` |
| Panel: WebView → Extension | `{ command:'pio', env, cmd }` etc. | `vscode.postMessage()` → `pv.onDidReceiveMessage(handler)` |
| Editor: Extension → WebView | `{ type:'update', bysec: {...} }` | `my.wv.postMessage()` → `window.addEventListener('message', ...)` |
| Editor: WebView → Extension | `{ type:'change', data: { sid, enabled, value, line } }` | `vscode.postMessage()` → `my.wv.onDidReceiveMessage(handler)` |

## MOTHERBOARD Field in the Config Editor

### Current State

The MOTHERBOARD field is parsed as part of Configuration.h during schema import.

**In `schema.js` (line 1712-1714):**
```javascript
if (define_name === "MOTHERBOARD" && boards?.length) {
  define_info.options = boards;
}
```

The `boards` variable is declared as `const boards = []` at line 1097 but **never populated**. This means MOTHERBOARD will always fall through to the plain text `<input>` in `addOptionLine()` (editview.js line 712).

When boards *were* populated, MOTHERBOARD would render as a `<select>` dropdown with all board names as options.

**In `marlin.js`:**
- `files.boards` is defined as `{ name: 'boards.h', path: ['src', 'core'] }` (line 23)
- `files.boards.text` is read during `refreshAll()` — it contains the raw text of `Marlin/src/core/boards.h`
- `extractBoardInfo(mb, mb_env)` reads `files.boards.text` to extract board description for display
- No function currently exists to scrape board names from boards.h

### How boards.h is Structured

`Marlin/src/core/boards.h` typically contains `#define BOARD_*` entries:
```c
#define BOARD_RAMPS_14_EFB  1020   // RAMPS 1.4
#define BOARD_RAMPS_14_EEB  1020   // RAMPS 1.4 (E1/E2/B)
...
```

To get the list of board names, we'd parse `files.boards.text` for `#define BOARD_` lines and extract the define name (e.g., `BOARD_RAMPS_14_EFB`).

### What MOTHERBOARD Field Needs

The user wants an **auto-complete text input** (like a `<datalist>`) — when you start typing, matching board names appear in a filtered list below. This behaves like a regular input field but with a dropdown of suggestions.

Currently the field is a plain `<input type="text">` at line 712 of `editview.js` because no options are set. To implement auto-complete:

1. **Populate `boards` in schema.js** by scraping board names from `boards.h` text during `combinedSchema()`
2. **Change the MOTHERBOARD field render** from a `<select>` (if options were set) or plain `<input>` to an `<input>` with `<datalist>` (HTML5 autocomplete)
3. In `addOptionLine()`, detect the MOTHERBOARD item and create the autocomplete input

## Extending the Architecture

### Adding a New Auto-Complete Field

1. Parse source data in schema.js (or in a helper loaded by editor.js)
2. Pass data through the schema item's `options` field or a new `autocomplete` field
3. In `addOptionLine()` (editview.js), detect the special field type and render with `<datalist>`
4. Handle change events the same way as regular text fields (via `handleEditField` / `commitChange`)

### Adding a New Config Tool Pane

1. Create the pane HTML file in `abm/pane/`
2. Load it in `abm.js`'s `webViewContent()` with `load_pane()`
3. Link it in `abm.html` under the `.subtabs` and `.subpanes` divs
4. Add form event handling in `abmview.js` or the specific pane's JS

## Key Patterns

- **Template evaluation**: HTML templates use backtick template literals with `${...}` interpolation, evaluated by `eval()`
- **Item references**: Each `.line` div's `inforef` property points back to its schema data item for bidirectional access
- **Multi-change batching**: `start_multi_update()`/`end_multi_update()` collects changes for atomic updates
- **Debouncing**: File change watch uses timeout debouncing (2s), edit fields use 500ms delay
- **IPC file**: A temp file path-based IPC mechanism signals command completion from Terminal to extension
