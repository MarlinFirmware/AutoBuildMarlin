# Auto Build Marlin

"Auto Build Marlin" provides a simplified interface to configure, build, and upload Marlin Firmware.

The **Auto Build** tool automatically detects the correct environments for your `MOTHERBOARD` and provides an interface to build them. No more editing `platformio.ini` or scanning a long list of environments in the PlatformIO IDE. Just press the **Build** button and go!

The **Configuration Editor** provides an enhanced interface to locate and edit configuration options, making it easier to locate the options you need and to discover the features you didn't know you needed. ***This is only an alpha preview at this time and will probably have some issues. Use "Reopen Editor With… > Text Editor" to use the standard text editor.*** Stay tuned for more enhancements to this excellent new feature.

## PlatformIO Required

When installing "Auto Build Marlin" you'll also be prompted to install the [PlatformIO extension](http://marlinfw.org/docs/basics/install_platformio_vscode.html). PlatformIO handles all the details of the build and is required for "Auto Build Marlin" to function.

## Usage

- Start *Visual Studio Code* and open a project folder with *Marlin Firmware* version 2.0 or later. Be careful to open the folder containing `platformio.ini` and not the "`Marlin`" folder within it. (You may also use the **Import Project…** option from the "PlaformIO Home" page.)

- The "File Explorer" should point to your Marlin Firmware folder like so:

  ![](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/Activity_bar.png)

### Configuration Editor

- Open the file `Configuration.h` or `Configuration_adv.h` to use the Configuration Editor. You may need to right-click on the window tab and choose "Reopen Editor with…" to activate the Config Editor. The Config Editor replaces the text view with a form divided up into sections.

  - Use the "Filter" field to locate options by name.
  - Click the "Show Comments" checkbox to show or hide comments.
  - Click the title of a section to hide/show that section.
  - Hold down `alt`/`option` and click on any title to hide/show all sections.

- Configuration files are annotated to provide some hints to configuration tools. Edit the configuration file text to add your own `@section` markers, provide allowed values for options, or improve documentation. Please submit your improvements and suggestions to improve the configuration experience.

### Auto Build

- Click the **Auto Build Marlin** icon ![AutoBuild Icon](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/AB_icon.png) in the Activity Bar (on the far side of the *Visual Studio Code* window) to activate the **Auto Build Marlin** sidebar panel.

  ![ABM Menu](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/AB_menu.png)

- Use the **Show ABM Panel** button (or click on any of the buttons in the toolbar) to open the Auto Build Marlin panel. If more than one target environment exists for your board you'll have to choose the specific environment to use before the build.

  Icon|Action
  ----|------
  ![Build](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/B_small.png)|Start **Marlin Build** to test your Marlin build
  ![Upload](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/U_small.png)|Start **Marlin Upload** to install Marlin on your board
  ![Traceback](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/T_small.png)|Start **Marlin Upload (traceback)** to install Marlin with debugging
  ![Clean](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/C_small.png)|Start **Marlin Clean** to delete old build files
  ![Configure](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/K_small.png)|Open the **Configuration Tool**

- The **Auto Build Marlin** panel displays information about your selected motherboard and basic machine parameters. Each board comes with one or more build environments that are used to generate the final Marlin binary. Choose the environment that best matches your MCU, bootloader, etc.

  ![Environments](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/abm-envs.png)

### Formatters

- Open the Command Palette and choose "Format Marlin Code." The file will be formatted according to Marlin standards.
- NOTE: The context menu item "Format Document With…" -> "Auto Build Marlin" doesn't work so ignore that menu command for now.

## Internals

The Auto Build Marlin extension for VSCode contributes a welcome panel, registered commands, a web view panel, a custom editor, and (soon) a tree view. It is built in Javascript so we don't have to learn TypeScript.
