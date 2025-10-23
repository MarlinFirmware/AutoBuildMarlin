# Change Log

The following enhancements and changes have been made to ***Auto Build Marlin***.

## 2.1.80
- Build: Fix 'reveal' for old Windows shell
- ABM Panel: Show hints on "USB" and Maple envs

## 2.1.79
- Config Editor: Fix true/false slider controls
- Docs Panel: Show on first run

## 2.1.78
- Docs Panel: Preserve last-used search filter
- Docs Panel: Use Flexbox layout, improve link bounds
- Schema: Clean up 'requires' clauses, empty comments
- Schema: Developer flag to export schema as JSON

## 2.1.77
- Docs Panel: Replacing "Info" panel
- Docs Panel: Filter now includes group name

## 2.1.76
- Info Panel: Clean up appearance

## 2.1.75
- Info Panel: Search marlinfw.org site for documentation.
- Config Editor: Add parsing for Marlin `2.1.3-b3` macros.

## 2.1.74
- Config Editor: Fix int and float value sanitizing
- ABM Panel: Fix parsing of arch list from `pins.h`

## 2.1.73
- Config Editor: Fix missing En Driver Type options
- Schema: Fix `HAS_DRIVER` arguments
- Schema: Improve cleanup of expression parentheses
- Ignore Aider files and folders

## 2.1.72
- ABM Panel: List all pins files included for `MOTHERBOARD`
- ABM Panel: Provide more space for main content
- Config Editor: Put early items into 'User' group
- Schema: Handle sensor type requirements
- Schema: Define "exclusive" options groups as `ConfigSchema.exclusive[]`
- Move Custom Editor and Info Panel HTML templates to files
- Continuing code refactor for shared schema

## 2.1.71
- Fix handling of multi-line value replacement

## 2.1.70
- Improve Config Editor layout
- Update Config Editors for external edits
- Fix temp sensor dependent items, add more

## 2.1.69
- Fix strict evaluation of empty array
- Fix non-matching SIDs
- Add navigation buttons to show the ABM panel
- Additional code refactoring and cleanup
- Shared schema for Config Editors and Info view
- Preserve basic clone disabled items
- Optimize change messages
- Optimize refresh after edit

## 2.1.68
- Fix strict evaluation of empty array

## 2.1.67
- Optimize Schema conditionals evaluation
- Use more robust parentheses cleanup method

## 2.1.66
- Fix Config Editor changes propagation
- Fix schema evaluation of `ENABLED`/`DISABLED`
- Add schema simple evaluation of `REPEAT` macros
- Add some useful schema iterator parameters

## 2.1.65
- Use iterators to simplify config data traversal
- Create serial id index on form creation

## 2.1.64
- Fix and improve cleanup for JS evaluation of conditionals
- Clarify that `ConfigSchema` data is grouped by section
- Fix `ConfigSchema.getItems` returning 0 results
- Fix evaluation of mixed-case options (e.g., `DEFAULT_Kp`)

## 2.1.63
- Improve Config Editor section pre-ordering and icons
- Better `ConfigSchema` consolidation of define `requires` conditions
- Fix Config Editor handling of underscores in the Filter field
- Show E Sensor IDs in the Auto Build Panel

## 2.1.62
- Config Editor:
  - Table of Contents navigation
  - Iconify Show/Hide filter checkboxes
  - Fix save/recall of hidden sections

## 2.1.61
- Add commands and buttons to open the Config Editor
- Fix config editor saving
- Update sponsorship URL

## 2.1.60
- Config Editor:
  - Group sequential items with the same name
  - Provide standard options for 'state' and 'dir' types
  - More mutual-exclusive checkbox groups
  - Preserve collapsed sections on show/hide document
  - Clean up and document some code

## 2.1.59
- Config Editor:
  - Fix handling of `#undef`
  - Identify macro defines
  - Use checkbox groups for optional distinct items
  - Add checkbox groups for like-named items

## 2.1.58
- Config Editor:
  - Fix filtering options by axis
  - Implement radio grouping for LCD items

## 2.1.57
- Config Editor: "Show Disabled" checkbox

## 2.1.56
- Config Editor: Handle `MB(...)` in schema

## 2.1.55
- Update for new `Conditionals-#-abc.h` files

## 2.1.54
- Config Editor: Fix parsing of `defined()` in `schema.js`
- Alt/Option changes "Clean" to "Purge" to delete build and libdeps
- Config Editor: Add on-the-fly `log_()` function to `editview.js`

## 2.1.53
- Prevent `platformio.ini` from opening by overriding a PlatformIO IDE setting.
  Enable "Preserve PIO" in settings to leave PlatformIO IDE settings unchanged.
- Display the version number in the ABM Panel.
- Improve high contrast color schemes.

## 2.1.52
- Fix `getItems` handling of `limit` across multiple sections
- Fix the regex that gets the `archs` list from `pins.h`

## 2.1.51
- Adjust build command line for different shells (#46)
- Fix init of HIGH / LOW slider custom controls (#68)
- Fix an issue with `//` comments before the first `#define` (#77)

## 2.1.50
- Recognize more config sections
- Fix build action button envs

## 2.1.49

- Recognize Chitu firmware with .cbd extension
- Fix schema options set on following settings
- Standardize JSON options cleanup method
- Remove old config parsing borrowed from Configurator 1.0
- Add Formatters information to the README
- Fix formatter debug logging
- Display author and version for a bad config

## 2.1.48

- Fix and extend configuration file parsing

## 2.1.47

- Make the Custom Editor (alpha) hidden by default
- Improve config error handling in Panel View

## 2.1.46

- Custom editor for configuration files (Alpha Preview)

## 2.1.45

- Command to Apply `config.ini` to configurations.
- Command to Export `config.ini`, `schema.json`, `schema.yml`
- Info Panel added (for future use)

## 2.1.44

- Code formatter for pins and general code
- Add categories to settings keys

## 2.1.43

- Show Panel on Startup by default
- Click the Pins file path to open the file
- Auto Reveal Build checkbox, setting
- Light and Dark Marlin SVG for dark/light theme
- Update Sponsor link
- Update jQuery to version 3.6.0

## 2.1.42

- Only init extension for a Marlin folder
- Fix schema @section detection
- Fix build view error
- Run sim/native in fg

## 2.1.41

- Hide 'Run' for incomplete build

## 2.1.40

- Add 'sponsor' field.

## 2.1.39

- Minor code reorganization.
- Fix path escaping for reveal build.

## 2.1.38

- Silent Build setting, with checkbox.

## 2.1.37

- Debuggable postMessage.
- Show STM32F1 chip flash size.

## 2.1.36

- Recognize `.srec` as a complete build.
- Remove `enableProposedApi` from `package.json`.
- Fix debug env detection.
- Add `CHANGELOG.md`.
- Update copyright date.

## 2.1.35

- Fix display of a failed build without a firmware file.
- Enquote the IPC file path, for paths with spaces.

## 2.1.34

- Larger built firmware link with firmware filename.

## 2.1.33

- Fix "Reveal Build" when there are spaces in the path.
- Fix PlatformIO opening `platformio.ini` when "Show on Startup" is enabled.

## 2.1.32

- Display buttons instead of simple links in the sidebar view.
- Fix display of native and simulator build targets.

## 2.1.31

- Keep "Show on Startup" in sync with settings.

## 2.1.30

- Fix the 'Show on Startup' checkbox.

## 2.1.29

- Clarify in error messages that Marlin 2.x is required.

## 2.1.28

- Add a "Show on Startup" option for the impatient.
- Include ***Auto Build Marlin*** commands in the Command Palette.
- Update [YouTube channel URL](https://www.youtube.com/c/MarlinFirmware).

## 2.1.27

- Recognize an `.srec` file as a firmware binary.

## 2.1.26

- Add a 'Monitor' button for quick access to PlatformIO serial monitor.
- Fixed visibility of 'Debug' button during native / simulator build.
- Add helpful parentheses to env type comparisons.

## 2.1.25

- Fix handling of multiple boards in a single `MB(...)` when parsing `pins.h`.

## 2.1.24

- Suppress a warning when the IPC file already exists.

## 2.1.23

- Add the ability to locate the binary in the `.pio/build/{env}/debug` folder
- Add security policy elements to the webView.

## 2.1.22

- Pass `PLATFORMIO_PATH` to the terminal as `PATH` / `Path` so the `platformio` exe is found.

## 2.1.21

- Reveal the latest build if there's more than one.

## 2.1.20

- Find the simulator binary when it's named "`MarlinSimulator`".

## 2.1.19

- Hide the "Run" button during the build.

## 2.1.18

- Remove obsolete command activation events.
- Add "Run" button to start a native target or simulation.

## 2.1.17

- More strict build exists test.
- Support platform-specific native targets.

## 2.1.16

- Improved startup when workspace is not Marlin.
- Minimize SVGs.
- Use gray in SVGs plus CSS blend modes for tool buttons contrast.

## 2.1.15

- Improve reliability of reveal.

## 2.1.14

- Fix startup failsafe.

## 2.1.13

- Hide 'debug' when busy.

## 2.1.12

- Move the model to its own module.
- Add light theme support.

## 2.1.11

- Fix reveal in Windows.

## 2.1.10

- Add `FUNDING.yml`.
- Add link to reveal the build in Explorer / Finder.
- Templated interface.

## 2.1.9

- More robust sensor regex.

## 2.1.8

- Fix reference to missing js.

## 2.1.7

- Look for more `.bin` names.

## 2.1.6

- Basic cleanup, text updates.

## 2.1.5

- Add a Welcome View with messages for different contexts.
- Activate the extension early to keep contexts up to date.
- Only display buttons relevant to environments / build states.
- Load the new pins file when `MOTHERBOARD` changes.

## 2.1.4

- Cleaned up code.
- Updated `README.md`.

## 2.1.3

- Only show Traceback option for "debug" environments.
- Drop `package-lock.json` from the project.
- Show an indeterminate progress bar during the build.

## 2.1.2

- Fix quoted value handling.

## 2.1.1

- Captions with extended descriptions in Build panel.
- Show an error when a build is already underway.
- Add a settings option to re-use the Terminal.
- Fix last build time display.

## 2.1.0

Major upgrade with a new native interface so you see what you need to know before you do your build. The new foundations started in this version will allow us to build a full configuration interface as time goes on and eliminate the need to scan through long text files.

- Clean up verbose SVG files.
- Drop dependency on `auto_build.py` script and Tkinter.
- Provide an informative WebView display and build interface.
- Only show relevant environments and build options.

## 2.0.3

- Pass process.env to the terminal.
- Apply titlecase to build type titles.

## 2.0.2

- Fix command line for Windows.
- Use node fs to check the script path.
- Use a common function for registered commands.

## 2.0.1

- Handle `auto_build.py` in different locations.

## 2.0.0

Initial release of ***Auto Build Marlin*** to the Marketplace with a version to match the current Marlin release.

- Add a button to the Activity Bar.
- Add panels with Build, Upload, Debug, and Clean buttons.
- Start to Build, Upload, Debug, or Clean when a button is pressed.
- Provide a helpful README page.
