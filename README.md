# Auto Build Marlin

"Auto Build Marlin" provides a one-button interface to build and upload Marlin Firmware to your selected `MOTHERBOARD`, removing the need to edit your `platformio.ini` file or scroll through a long list of Marlin environments.

## Get PlatformIO

When installing "Auto Build Marlin" you'll also be prompted to install the [PlatformIO extension](http://marlinfw.org/docs/basics/install_platformio_vscode.html). This is required for "Auto Build Marlin" to function.

## Usage

- Open up the downloaded *Marlin Firmware* project folder (***NOT the "Marlin" folder within***) in *Visual Studio Code*. (You may also use the **Import Project…** option from the "PlaformIO Home" page.)

- With Marlin open, the "File Explorer" should be firmly rooted in your Marlin Firmware folder:

  ![](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/Activity_bar.png)

- Click the **Marlin Auto Build** icon ![AutoBuild Icon](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/AB_icon.png) in the Activities Bar (on the left side of *Visual Studio Code* window) to bring up the **Marlin Auto Build** options bar.

  ![](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/AB_menu.png)

- Click one of the four icons

  Icon|Action
  ----|------
  ![](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/B_small.png)|Start **Marlin Build** to test your Marlin build
  ![](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/U_small.png)|Start **Marlin Upload** to install Marlin on your board
  ![](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/T_small.png)|Start **Marlin Upload (traceback)** to install Marlin with debugging
  ![](https://github.com/MarlinFirmware/AutoBuildMarlin/raw/master/img/C_small.png)|Start **Marlin Clean** to delete old build files
