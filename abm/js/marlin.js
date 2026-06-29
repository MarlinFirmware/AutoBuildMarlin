/**
 * Auto Build Marlin
 * abm/marlin.js - Functions to parse, read, and write Marlin configs.
 */

const path = require('path'),
        fs = require('fs'),
        os = require('os'),
    schema = require('./schema');

const vscode = require('vscode'), ws = vscode.workspace,
      workspaceRoot = (ws && ws.workspaceFolders && ws.workspaceFolders.length) ? ws.workspaceFolders[0].uri.fsPath : '';

var temp = {}, bugme = false;

function init(b) { bugme = b; }

//
// Files to parse for config, version, and build info.
//
var files = {
  pins:       { name: 'pins.h',              path: ['src', 'pins'] },
  boards:     { name: 'boards.h',            path: ['src', 'core'] },
  config:     { name: 'Configuration.h',     path: []              },
  config_adv: { name: 'Configuration_adv.h', path: []              },
  version:    { name: 'Version.h',           path: ['src', 'inc']  }
};

// TODO: Use config data from Schema object

// Get whether a setting is enabled (defined) in a blob of text
function _confDefined(text, optname) {
  const find = new RegExp(`^\\s*#define\\s+${optname}\\b`, 'gm'),
        r = find.exec(text);
  if (bugme) console.log(`${optname} is ${r?'ENABLED':'unset'}`);
  return (r !== null); // Any match means it's uncommented
}

// Get whether a setting is enabled (defined) in one or both config files
function confDefined(fileid, optname) { return _confDefined(files[fileid].text, optname); }
function configDefined(optname)       { return confDefined('config',     optname); }
function configAdvDefined(optname)    { return confDefined('config_adv', optname); }
function configAnyDefined(optname) {
  return configDefined(optname) ? true : configAdvDefined(optname);
}

// Get a single config value by scraping the given text
function _confValue(text, optname) {
  var val = '';
  const find = new RegExp(`^\\s*#define\\s+${optname}\\s+(.+)`, 'gm'),
        r = find.exec(text);
  if (r) val = r[1].replace(/\s*(\/\/.*)?$/, '');
  return val;
}

// Get the value of a single config option, searching one or both config files
function confValue(fileid, optname) { return _confValue(files[fileid].text, optname); }
function configValue(optname)       { return confValue('config',     optname); }
function configAdvValue(optname)    { return confValue('config_adv', optname); }
function configAnyValue(optname) {
  if (configDefined(optname))    return configValue(optname)
  if (configAdvDefined(optname)) return configAdvValue(optname);
}

//
// Return a path object for Marlin/parts[0]/parts[1]/...
//
function pathFromArray(parts) {
  return path.join(workspaceRoot, 'Marlin', parts.join(path.sep));
}

//
// Get the full path to the Marlin file for a given file description
//
function fullPathForFileDesc(f) {
  if (!f.fullpath) {
    var p = f.path; p.push(f.name);
    f.fullpath = pathFromArray(p);
  }
  return f.fullpath;
}

const filePathForID = (fileid) => fullPathForFileDesc(files[fileid]);

//
// Watch files for changes
//
var watchers = [];
function unwatchConfigurations() {
  watchers.forEach((w) => { w.close() });
  watchers = [];
}

function watchConfigurations(handler) {
  unwatchConfigurations();
  watchers = [
    fs.watch(filePathForID('config'),     {}, handler),
    fs.watch(filePathForID('config_adv'), {}, handler)
  ];
}

//
// Check for valid Marlin files
//
function validate() {
  if (workspaceRoot == '') return { ok: false, error: 'Error: No folder is open.' };
  for (const k in files) {      // Iterate keys
    const err = fileCheck(k);
    if (err)
      return { ok: false, error: `Error: ${files[k].name} ${err}.` };
  }
  return { ok: true };
}

function watchAndValidate(handler) {
  unwatchConfigurations();
  if (workspaceRoot == '') return;
  const marlin_path = path.join(workspaceRoot, 'Marlin');
  if (fs.existsSync(marlin_path))
    watchers = [ fs.watch(marlin_path, {}, handler) ];
}

//
// Verify that one of Marlin's files exists
//
function fileCheck(fileid) {
  var file_issue;
  try {
    fs.accessSync(filePathForID(fileid), fs.constants.F_OK | fs.constants.W_OK);
  } catch (err) {
    file_issue = err.code === 'ENOENT' ? 'is missing' : 'is read-only';
  }
  return file_issue;
}

//
// Read a Marlin/ workspace file and cache the contents in files[fileid].text
// If a config group is loading, load asynchronously, and if this is the last file call onSuccess()
// For any read error call onError().
//
function readMarlinFileContents(fileid, onSuccess, onError) {

  const mf_path = filePathForID(fileid);
  const filespec = files[fileid];

  if (bugme) console.log(`Reading... ${mf_path}`);

  if (temp.filesToLoad) {
    fs.readFile(mf_path, (err, data) => {
      if (err)
        onError(err, `Couldn't read ${filespec.name}`);
      else {
        filespec.text = data.toString();
        if (--temp.filesToLoad == 0) onSuccess();
      }
    });
  }
  else {
    try {
      // Use node.js to read the file
      //var data = fs.readFileSync(mf_path);
      filespec.text = fs.readFileSync(mf_path, {encoding:'utf8'});
    } catch (err) {
      onError(err, `Couldn't read ${filespec.name}`);
    }
  }
}

//
// Reload all parsed files and run success/error callback
//
function refreshAll(onSuccess, onError) {
  temp.filesToLoad = Object.keys(files).length;
  for (const fid in files)      // Iterate keys
    readMarlinFileContents(fid, onSuccess, onError);
}

//
// - Get Marlin version and distribution date
//
var version_info;
function extractVersionInfo() {
  version_info = {
    vers: _confValue(files.version.text, 'SHORT_BUILD_VERSION').dequote(),
    date: _confValue(files.version.text, 'STRING_DISTRIBUTION_DATE').dequote(),
    auth: _confValue(files.config.text, 'STRING_CONFIG_H_AUTHOR').dequote()
  };
  return version_info;
}

//
// Extract temperature sensor options from Configuration.h
//
var temp_sensor_desc;
function extractTempSensors() {

  //pv.postMessage({ command:'text', text:files.config.text });

  // Get all the thermistors and save them into an object
  const findAll = new RegExp('^\\s*\\*\\s*Temperature sensors .+$([\\s\\S]+\\*\\/)', 'gm'),
        findEach = new RegExp('^\\s*\\*\\s*(-?\\d+)\\s*:\\s*(.+)$', 'gm'),
        r = findAll.exec(files.config.text);

  var out = {};
  let s;
  while (s = findEach.exec(r[1])) out[s[1]] = { desc: s[2] };

  temp_sensor_desc = out;
  return temp_sensor_desc;
}

//
// - Get pins file, archs, and envs for a board from pins.h.
// - If the board isn't found, look for a rename alert.
// - Get the status of environment builds.
//
// Return hashed array { mb, pins_files, archs, archs_arr, envs, short, description, (has_debug), (error) }
//
var board_info;
function extractBoardInfo(mb, mb_env) {
  let r, out = { has_debug: false }, sb = mb.replace('BOARD_', '');

  // Get the include line matching the board
  const lfind = new RegExp(`if\\s*MB\\(.*\\b${sb}\\b.*\\).*\n\\s*(#include.+)\n`, 'g');
  if ((r = lfind.exec(files.pins.text))) {

    let inc_line = r[1];

    // mb: MOTHERBOARD name
    out.mb = mb;

    // pins_files: Pins files relative paths
    out.pins_files = [];

    const pinfind = new RegExp(`#include\\s+"((.+/)?pins_.+)"`, 'g');
    let short_pins_path = inc_line.replace(/.*#include\s+"([^"]*)".*/, '$1');
    while (short_pins_path) {
      out.pins_files.push({
        text: short_pins_path,
        uri: path.join('Marlin', 'src', 'pins', short_pins_path)
      });
      const pinfile_path = pathFromArray(['src', 'pins', ...short_pins_path.split('/')]);
      const pinfile_dir = short_pins_path.replace(/\/pins_.+\.h$/, '');
      short_pins_path = null;
      if (fs.existsSync(pinfile_path)) {
        const pinfile_text = fs.readFileSync(pinfile_path, {encoding:'utf8'});
        if ((r = pinfind.exec(pinfile_text))) {
          short_pins_path = `${pinfile_dir}/${r[1]}`.replace(/[^\/]+\/\.\.\//, '');
        }
      }
    }

    // archs: The architecture(s) for the board
    out.archs = inc_line.replace(/.+\/\/\s*((\w+\s*)+(,\s*\w+\s*)*)(env|mac|win|lin|uni):.+/, '$1').trim();
    out.archs_arr = out.archs.split(/\s*,\s*/);

    // envs: The environments for the board
    out.envs = [];

    const efind = /(env|mac|win|lin|uni):(\w+)/g,
          platMap = { win32: 'win', darwin: 'mac', linux: 'lin' },
          platform = platMap[process.platform] || 'uni';

    let match;
    while ((match = efind.exec(inc_line))) {
      const [_full, type, name] = match;

      // Skip if the current platform doesn't match
      if (type !== 'env' && type !== platform) continue;

      let note = '';
      if (/STM32F....E/i.test(name)) note = '(512K)';
      else if (/STM32F....C/i.test(name)) note = '(256K)';

      const debugenv = /_debug$/i.test(name);
      out.envs.push({ name, note, debug: debugenv, native: type !== 'env', prefer: (mb_env == name) });
      if (debugenv) out.has_debug = true;
    }

    // Get the description from the boards.h file
    const cfind = new RegExp(`#define\\s+${mb}\\s+\\d+\\s*//(.+)`, 'gm');
    r = cfind.exec(files.boards.text);
    out.description = r ? r[1].trim() : '';
  }
  else {
    const ofind = new RegExp(`#error\\s+"(${mb} is no longer [^.]+)`, 'g'),
          bfind = new RegExp(`#error\\s+"(${mb} (has been renamed|is now) [^.]+)`, 'g');
    if ((r = ofind.exec(files.pins.text))) {
      out.error = r[1];
      out.short = `Unsupported MOTHERBOARD`;
    }
    else if ((r = bfind.exec(files.pins.text))) {
      // TODO: Show a "Fix" button to update an old board name.
      out.error = r[1];
      out.fix = `fixboard("${mb}")`;
    }
    else if (!mb.startsWith('BOARD_')) {
      out.error = "MOTHERBOARD name missing 'BOARD_'";
      out.short = "Missing 'BOARD_'?";
    }
    else {
      out.error = `Unknown MOTHERBOARD ${mb}`;
      out.short = `Unknown MOTHERBOARD`;
    }
  }

  board_info = out;
  return board_info;
}

//
// Get the type of geometry and stuff like that
// Return hashed array { name, style, dimensions, description, heated_bed, (bed_sensor) }
//
var machine_info;
function getMachineSettings() {
  var out = {};

  out.name = configValue('CUSTOM_MACHINE_NAME').dequote();

  const mtypes = [
    'DELTA',
    'MORGAN_SCARA', 'MP_SCARA', 'AXEL_TPARA',
    'COREXY', 'COREXZ', 'COREYZ', 'COREYX', 'COREZX', 'COREZY',
    'MARKFORGED_XY', 'MARKFORGED_YX',
    'ARTICULATED_ROBOT_ARM', 'FOAMCUTTER_XYUV', 'POLAR'
  ];
  const mpretty = [
    'Delta',
    'Morgan SCARA', 'MP SCARA', 'Axel TPARA',
    'CoreXY', 'CoreXZ', 'CoreYZ', 'CoreYX', 'CoreZX', 'CoreZY',
    'Markforged XY', 'Markforged YX',
    'Robot Arm', 'Foam Cutter', 'Polar'
  ];

  const s = out.style = mtypes
    .map((v, i) => (configDefined(v) ? mpretty[i] : null))
    .find(s => s !== null) || 'Cartesian';

  const d = out.dimensions = { x: configValue('X_BED_SIZE'), y: configValue('Y_BED_SIZE'), z: configValue('Z_MAX_POS') };

  out.description = `${s} ${d.x}x${d.y}x${d.z}mm`;

  const bed_sensor = configValue('TEMP_SENSOR_BED');
  out.heated_bed = !!(1 * bed_sensor);
  if (out.heated_bed) {
    out.bed_sensor = bed_sensor;
    out.description += ` with Heated Bed [ ${bed_sensor} ]`;
  }
  else
    out.description += ' (no Heated Bed)';

  machine_info = out;
  return machine_info;
}

//
// Get the number of EXTRUDERS and related options
// Return hashed array { extruders, diam, (sensors[]), (sensor_err), type, fancy, description }
//
var extruder_info;
function getExtruderSettings() {
  var out = {};
  const extruders = configValue('EXTRUDERS') * 1;

  out.extruders = extruders;
  out.diam = configValue('DEFAULT_NOMINAL_FILAMENT_DIA');

  // Get the extruder temp sensors
  out.sensors = [];
  for (let i = 0; i < extruders; i++)
    if (!(out.sensors[i] = configValue(`TEMP_SENSOR_${i}`)))
      out.sensor_err = true;

  if (extruders == 1 && configDefined('TEMP_SENSOR_1_AS_REDUNDANT'))
    out.sensors[1] = configValue('TEMP_SENSOR_1');

  // Only one of these types is allowed at a time
  const epretty = [ 'Single Nozzle' ];
  schema.ConfigSchema.exclusive.toolhead.every((v,i) => {
    if (!configDefined(v)) return true;
    out.type = epretty[i] ?? v.toLabel();
    return false;
  });

  // These are mutually-exclusive
  const efancy = [ 'MIXING_EXTRUDER', 'SWITCHING_EXTRUDER', 'SWITCHING_NOZZLE', 'MK2_MULTIPLEXER', 'PRUSA_MMU2' ];
  efancy.every((v) => {
    if (!configDefined(v)) return true;
    out.fancy = v.toLabel();
  });

  if (out.fancy) {
    let e = extruders;
    if (out.fancy == 'Mixing Extruder')
      e = out.steppers = configValue('MIXING_STEPPERS');
    out.fancy += ` (${e} channels)`;
  }

  if (!out.type && !out.fancy) {
    switch (out.extruders) {
      case 1: out.description = '(Single Extruder)'; break;
      case 2: out.description = '(Dual Extruder)'; break;
      default: out.description = out.extruders + ' Extruders'; break;
    }
  }
  else {
    if (out.type && out.fancy)
      out.description = `${out.type} with ${out.fancy}`;
    else if (out.type == 'Single Nozzle')
      out.description = `Single Nozzle with ${out.extruders} inputs`;
    else if (out.type)
      out.description = `${out.type} with ${out.extruders}`;
    else
      out.description = out.fancy;
  }

  out.description += " [ " + out.sensors.join(', ') + " ]";

  extruder_info = out;
  return extruder_info;
}

// LCD option-name to human-readable display-name lookup
// Populated from marlinfw.org documentation.
// Anything not listed here falls back to the raw option name.
var lcd_display_names = {
  'REPRAP_DISCOUNT_SMART_CONTROLLER': 'RepRapDiscount Smart Controller',
  'REPRAP_DISCOUNT_FULL_GRAPHIC_SMART_CONTROLLER': 'RepRapDiscount Full Graphic Smart Controller',
  'ULTIMAKERCONTROLLER': 'Ultimaker Controller',
  'ULTIPANEL': 'ULTIPANEL',
  'PANEL_ONE': 'PanelOne',
  'G3D_PANEL': 'Gadgets3D G3D LCD/SD Controller',
  'RIGIDBOT_PANEL': 'RigidBot Panel V1.0',
  'ANET_KEYPAD_LCD': 'Anet Keypad LCD',
  'RA_CONTROL_PANEL': 'Elefu RA Board Control Panel',
  'LCD_SAINSMART_I2C_1602': 'Sainsmart YWRobot LCD Display (16x2)',
  'LCD_SAINSMART_I2C_2004': 'Sainsmart YWRobot LCD Display (20x4)',
  'LCD_I2C_SAINSMART_YWROBOT': 'Sainsmart YWRobot LCM1602 LCD Display',
  'LCM1602': 'Generic LCM1602 LCD adapter',
  'LCD_I2C_PANELOLU2': 'PANELOLU2 LCD (with status LEDs, encoder)',
  'LCD_I2C_VIKI': 'Panucatt VIKI LCD (with status LEDs, encoder)',
  'SAV_3DLCD': 'Shift Register LCD panel',
  'FF_INTERFACEBOARD': 'FF Interface Board',
  'MIGHTYBOARD_LCD': 'MightyBoard LCD',
  'TFTGLCD_PANEL_SPI': 'TFTGLCD Panel (SPI)',
  'TFTGLCD_PANEL_I2C': 'TFTGLCD Panel (I2C)',
  'CARTESIO_UI': 'Cartesio UI',
  'MAKRPANEL': 'MaKr3D Makr-Panel',
  'REPRAPWORLD_GRAPHICAL_LCD': 'ReprapWorld Graphical LCD',
  'VIKI2': 'Panucatt Devices Viki 2.0',
  'miniVIKI': 'Panucatt mini Viki',
  'ELB_FULL_GRAPHIC_CONTROLLER': 'Adafruit ST7565 Full Graphic Controller',
  'MINIPANEL': 'MakerLab Mini Panel',
  'BQ_LCD_SMART_CONTROLLER': 'BQ LCD Smart Controller',
  'ANET_FULL_GRAPHICS_LCD': 'Anet Full Graphics LCD',
  'CTC_A10S_A13': 'CTC A10S/A13 LCD',
  'AZSMZ_12864': 'Azsmz 12864 LCD',
  'SILVER_GATE_GLCD_CONTROLLER': 'Silver Gate GLCD Controller',
  'EMOTION_TECH_LCD': 'Emotion Tech LCD',
  'U8GLIB_SSD1306': 'SSD1306 OLED full graphics display',
  'SAV_3DGLCD': 'SAV OLED LCD (SSD1306/SH1106)',
  'OLED_PANEL_TINYBOY2': 'TinyBoy2 128x64 OLED / Encoder Panel',
  'MKS_12864OLED': 'MKS 12864 OLED Display',
  'MKS_12864OLED_SSD1306': 'MKS 12864 OLED SSD1306 Display',
  'ZONESTAR_12864LCD': 'Zonestar 12864 LCD',
  'ZONESTAR_12864OLED': 'Zonestar 12864 OLED',
  'ZONESTAR_12864OLED_SSD1306': 'Zonestar 12864 OLED SSD1306',
  'U8GLIB_SH1106_EINSTART': 'U8GLib SH1106 Einstart OLED',
  'OVERLORD_OLED': 'Overlord OLED',
  'FYSETC_242_OLED_12864': 'FYSETC 2.42" OLED 12864',
  'K3D_242_OLED_CONTROLLER': 'K3D 242 OLED Controller',
  'DGUS_LCD_UI': 'DGUS LCD UI',
  'DGUS_LCD': 'DGUS LCD',
  'MALYAN_LCD': 'Malyan LCD',
  'TOUCH_UI_FTDI_EVE': 'Touch UI FTDI EVE',
  'LULZBOT_TOUCH_UI': 'LulzBot Touch UI',
  'ANYCUBIC_LCD_CHIRON': 'Anycubic LCD Chiron',
  'ANYCUBIC_LCD_I3MEGA': 'Anycubic LCD i3 Mega',
  'ANYCUBIC_LCD_VYPER': 'Anycubic LCD Vyper',
  'ANYCUBIC_TFT_MODEL': 'Anycubic TFT Model',
  'SOVOL_SV06_RTS': 'Sovol SV06 RTS Display',
  'NEXTION_TFT': 'Nextion TFT Display',
  'EXTENSIBLE_UI': 'Extensible UI',
  'MKS_TS35_V2_0': 'MKS TS35 V2.0',
  'MKS_ROBIN_TFT24': 'MKS Robin TFT24',
  'MKS_ROBIN_TFT28': 'MKS Robin TFT28',
  'MKS_ROBIN_TFT32': 'MKS Robin TFT32',
  'MKS_ROBIN_TFT35': 'MKS Robin TFT35',
  'MKS_ROBIN_TFT43': 'MKS Robin TFT43',
  'MKS_ROBIN_TFT_V1_1R': 'MKS Robin TFT V1.1R',
  'MKS_ROBIN_TFT': 'MKS Robin TFT',
  'TFT_TRONXY_X5SA': 'TFT Tronxy X5SA',
  'ANYCUBIC_TFT35': 'Anycubic TFT35',
  'LONGER_LK_TFT28': 'Longer LK TFT28',
  'ANET_ET4_TFT28': 'Anet ET4 TFT28',
  'ANET_ET5_TFT35': 'Anet ET5 TFT35',
  'BIQU_BX_TFT70': 'BIQU BX TFT70',
  'BTT_TFT35_SPI_V1_0': 'BTT TFT35 SPI V1.0',
  'TFT_GENERIC': 'Generic TFT Display',
  'TFT_CLASSIC_UI': 'TFT Classic UI',
  'TFT_COLOR_UI': 'TFT Color UI',
  'TFT_LVGL_UI': 'TFT LVGL UI',
  'TFT_LVGL_UI_FSMC': 'TFT LVGL UI FSMC',
  'TFT_LVGL_UI_SPI': 'TFT LVGL UI SPI',
  'FSMC_GRAPHICAL_TFT': 'FSMC Graphical TFT',
  'SPI_GRAPHICAL_TFT': 'SPI Graphical TFT',
  'TFT_320x240': 'TFT 320x240',
  'TFT_320x240_SPI': 'TFT 320x240 SPI',
  'TFT_480x320': 'TFT 480x320',
  'TFT_480x320_SPI': 'TFT 480x320 SPI',
  'DWIN_CREALITY_LCD': 'DWIN CREALITY LCD',
  'DWIN_LCD_PROUI': 'DWIN LCD ProUI',
  'DWIN_CREALITY_LCD_JYERSUI': 'DWIN CREALITY LCD JYersUI',
  'DWIN_MARLINUI_PORTRAIT': 'DWIN MarlinUI Portrait',
  'DWIN_MARLINUI_LANDSCAPE': 'DWIN MarlinUI Landscape',
  'BEEZ_MINI_12864': 'Beez Mini 12864',
  'WYH_L12864': 'WYH L12864 LCD',
  'K3D_FULL_GRAPHIC_SMART_CONTROLLER': 'K3D Full Graphic Smart Controller',
  'MKRPANEL': 'MaKr3D Makr-Panel',
  'MKS_MINI_12864': 'MKS Mini 12864',
  'MKS_MINI_12864_V3': 'MKS Mini 12864 V3',
  'MKS_LCD12864A': 'MKS LCD12864A',
  'MKS_LCD12864B': 'MKS LCD12864B',
  'FYSETC_MINI_12864_X_X': 'FYSETC Mini 12864 X.X',
  'FYSETC_MINI_12864_1_2': 'FYSETC Mini 12864 1.2',
  'FYSETC_MINI_12864_2_0': 'FYSETC Mini 12864 2.0',
  'FYSETC_MINI_12864_2_1': 'FYSETC Mini 12864 2.1',
  'FYSETC_GENERIC_12864_1_1': 'FYSETC Generic 12864 1.1',
  'BTT_MINI_12864': 'BTT Mini 12864',
  'BTT_MINI_12864_V1': 'BTT Mini 12864 V1',
  'CR10_STOCKDISPLAY': 'Creality CR10 Stock Display',
  'ENDER2_STOCKDISPLAY': 'Ender-2 Stock Display',
  'ULTI_CONTROLLER': 'Ulti Controller',
  'LCD_FOR_MELZI': 'LCD for Melzi',
  'SAVE_3DLCD': 'SAV 3D LCD',
  'MAKEBOARD_MINI_2_LINE_DISPLAY_1602': 'Makeboard Mini 2-Line 1602 Display',
  'RADDS_DISPLAY': 'RADDS Display',
  'ULTRA_LCD': 'Ultra LCD',
  'YHCB2004': 'YHCB2004 LCD',
  'ZONESTAR_LCD': 'Zonestar LCD',
};

// Get the LCD controller and related options
// Return hashed array { name, variant, description }
//
var lcd_info;
function getLCDSettings() {
  const out = {};

  // Find the enabled LCD from the exclusive LCD options list
  const lcdOptions = schema.ConfigSchema.exclusive.lcd;
  for (let i = 0; i < lcdOptions.length; i++) {
    if (configAnyDefined(lcdOptions[i])) {
      out.name = lcdOptions[i];
      const val = configAnyValue(lcdOptions[i]);
      out.variant = val;
      // Use the display name lookup, falling back to the raw option name
      const displayName = lcd_display_names[lcdOptions[i]] || lcdOptions[i];
      out.description = val ? `${displayName} (${val})` : displayName;
      break;
    }
  }

  lcd_info = out;
  return lcd_info;
}

//
// Re-fetch information from the board's pins file(s)
// and re-load the pins file contents into files.pindef.text
// Return hashed array with { name, path, mb }
//
var pindef_info;
function getPinDefinitionInfo(mb) {
  if (!files.pindef || files.pindef.mb != mb) {
    const pbits = `src/pins/${board_info.pins_files[0].text}`.split('/');
    files.pindef = { name: pbits.pop(), path: pbits, mb: mb };
    readMarlinFileContents('pindef'); // Since temp.filesToLoad == 0 just read the file
  }

  pindef_info = {
    board_name: confValue('pindef', 'BOARD_INFO_NAME').dequote()
  };

  return pindef_info;
}

module.exports = {
  workspaceRoot, pathFromArray,

  files, init, validate, refreshAll,

  watchConfigurations, watchAndValidate,

  configDefined,
  configValue, confValue, _confValue,

  extractVersionInfo, extractTempSensors, extractBoardInfo,
  getMachineSettings, getExtruderSettings, getLCDSettings, getPinDefinitionInfo
};
