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
AutoBuildMarlin/
├── extension.js          # Extension entry point
├── proto.js              # String/Number/Date prototype extensions
├── package.json          # Extension manifest
├── README.md             # User documentation
├── CHANGELOG.md          # Version history
├── LICENSE               # License file
├── abm/                  # Main extension modules
│   ├── abm.js           # Build tool methods (core logic)
│   ├── marlin.js        # Marlin config parsing and data model
│   ├── editor.js        # Configuration file custom editor provider
│   ├── prefs.js         # Extension preferences/settings
│   ├── format.js        # Code formatting commands
│   ├── info.js          # Marlin Info sidebar provider
│   ├── abm.html         # Main webview HTML template
│   ├── js/              # Webview JavaScript modules
│   │   ├── schema.js    # Config schema parser (44KB)
│   │   ├── webview.js   # Webview message handling
│   │   ├── editview.js  # Config editor webview logic
│   │   ├── grid.js      # Grid layout utilities
│   │   └── jstepper.js  # Stepper control UI
│   ├── css/             # Stylesheets
│   ├── pane/            # Sub-pane HTML templates (geom, sd, lcd)
│   └── img/             # Images and icons
├── resources/           # VS Code resource files (SVGs)
└── img/                 # Documentation images
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
