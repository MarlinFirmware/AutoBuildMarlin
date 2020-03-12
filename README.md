# Auto Build Marlin

"Auto Build Marlin" provides a one-button interface to build and upload Marlin Firmware to your selected `MOTHERBOARD`, removing the need to edit your `platformio.ini` file or scroll through a long list of Marlin environments.

## Get PlatformIO

When installing "Auto Build Marlin" you'll also be prompted to install the [PlatformIO extension](http://marlinfw.org/docs/basics/install_platformio_vscode.html). This is required for "Auto Build Marlin" to function.

## Usage

- Open up the downloaded *Marlin Firmware* project folder (***NOT the "Marlin" folder within***) in *Visual Studio Code*. (You may also use the **Import Project…** option from the "PlaformIO Home" page.)

- With Marlin open, the "File Explorer" should be firmly rooted in your Marlin Firmware folder:

  ![](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/Activity_bar.png)

- Click the **Auto Build Marlin** icon ![AutoBuild Icon](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/AB_icon.png) in the Activities Bar (on the left side of *Visual Studio Code* window) to bring up the **Auto Build Marlin** options bar.

  ![ABM Menu](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/AB_menu.png)

- Click any of the tool icons to open the Auto Build panel. If there's only one target environment for your board the selected action will be started. Otherwise you will have to specify the environment.

  Icon|Action
  ----|------
  ![Build](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/B_small.png)|Start **Marlin Build** to test your Marlin build
  ![Upload](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/U_small.png)|Start **Marlin Upload** to install Marlin on your board
  ![Traceback](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/T_small.png)|Start **Marlin Upload (traceback)** to install Marlin with debugging
  ![Clean](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/C_small.png)|Start **Marlin Clean** to delete old build files
  ![Configure](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/K_small.png)|Open the **Configuration Tool**

- The **Auto Build Marlin** panel displays information about your selected motherboard and basic machine parameters. Each board comes with one or more build environments that are used to generate the final Marlin binary. Choose the environment that best matches your MCU, bootloader, etc.

  ![Environments](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/abm-envs.png)
