/**
 * Auto Build Marlin
 * abm/js/schema.js
 *
 * The schema imports a configuration as a dictionary so it can be
 * used for the Custom Editor form or export to JSON, YML, or even
 * YAML tailored to Jekyll.
 *
 * Loaded by custom views (e.g., editor.js) so they can use this
 * class to do things with the unserialized schema data.
 *
 * The same ConfigSchema class object is accessible from all view
 * providers, so loaded config data is cached for all view providers.
 * View providers must provide their own message handling to update
 * their webviews via serialized messages, and to receive messages
 * from their views to update the schema.
 */
'use strict';

function log(message, line = 0) {
  if (ConfigSchema.verbose) console.log(line ? `[${line}] ${message}` : message);
}

/**
 * ConfigSchema encapsulates a single configuration file schema, imported
 * from C/C++ header files with #define directives and custom macros.
 *
 * - The schema is stored in a 'bysec' dictionary keyed by section, then by option name.
 *   - This order is chosen for convenience in generating the form, but could mess with
 *     multiple items with the same name within the same config section.
 * - The 'bysid' dictionary is keyed by sid and is created to reference the same data.
 *   - If 'bysec' is created from text, restored from state, or unserialized, the 'bysid'
 *     index must be regenerated, so always use the setter setDataBySection(bysec).
 * - Each item in the schema is a dictionary with information about a single #define.
 *   See the description at importText() below for the #define info structure.
 *
 * - The import pass:
 *   - Gathers an exhaustive list of all #define items, both enabled and disabled.
 *   - Captures the nested #if structure indirectly:
 *     - Each item has a 'requires' field with the block conditions translated into Javascript.
 *     - The 'requires' Javascript can only run inside of evaluateRequires.
 *   - The 'evaled' result on an item is set by calling evaluateRequires(item).
 *   - Deleting the 'evaled' field and calling evaluateRequires(item) forces re-evaluation.
 *     When every item afterward needs re-evaluation, call updateEditedItem(changes, true).
 *
 */
class ConfigSchema {

  // Debugging and logging
  static verbose = false;
  debug() { console.dir(this); }
  debug_sections() { console.log(Object.keys(this.bysec)); }

  // Populate a new schema from text, numbering lines starting from an index.
  constructor(text, numstart=0) {
    this.bysec = {};  // { sec1: { nam1: { ... }, ... }, ... }
    this.bysid = [];  // { sid1: { ... }, ... }
    if (text) this.importText(text, numstart);
  }

  // Iterate the items in a section dictionary
  *iterateSectionItems(items) {
    // items: { name1: [ {*}, {*}, ... ], name2: {*}, ... }
    for (const [_name, item] of Object.entries(items))
      yield* Array.isArray(item) ? item : [item];
  }

  // Iterate items in sections order
  *iterateDataBySection(bysec=this.bysec) {
    // bysec: { sect1: { ... }, sect2: { ... }, ... }
    for (const [_sect, items] of Object.entries(bysec))
      yield* this.iterateSectionItems(items);
  }

  // Iterate items in sections order, only those with the given name
  *iterateItemsWithName(name, bysec=this.bysec) {
    // bysec: { sect1: { name1: [ {*}, {*}, ... ], name2: {*}, ... }, sect2: { ... }, ... }
    for (const [sect, items] of Object.entries(bysec)) {
      if (!(name in items)) continue;
      const item = bysec[sect][name];
      yield* Array.isArray(item) ? item : [item];
    }
  }

  // Iterate items in SID order (skipping index 0)
  *iterateDataBySID(start=1) {
    for (let i = start; i < this.bysid.length; i++)
      if (this.bysid[i] != null) // Skip undefined or null (should never occur)
        yield this.bysid[i];
  }

  // Return the first item (lowest SID) passing the given test function.
  firstItem(fn) {
    for (const item of this.iterateDataBySID())
      if (fn(item)) return item;
  }

  // Return the last item (highest SID) passing the given test function.
  lastItem(fn) {
    let outitem = null;
    for (const item of this.iterateDataBySID())
      if (fn(item)) outitem = item;
    return outitem;
  }

  // Refresh the bysid index from the data stored in sections
  refreshDataBySID() {
    // Create a new array to avoid memory leaks from old references
    const newBysid = [];
    for (const item of this.iterateDataBySection()) newBysid[item.sid] = item;
    this.bysid = newBysid;
  }

  // Setter for the data, collated into the form { sec1: { nam1: { ... }, name2: [ { ... }, { ... } ], ... }
  setDataBySection(bysec) {
    this.bysec = bysec;
    this.refreshDataBySID();
  }

  countPriorItems(fn, before, limit=0) {
    let count = 0;
    for (const item of this.iterateDataBySID()) {
      if (ConfigSchema.definedBefore(item, before) && fn(item)) {
        count++;
        if (count >= limit) break;
      }
    }
    return count;
  }

  // Factory method to create a new uninitialized schema.
  static newSchema() {
    return new ConfigSchema();
  }
  // Factory method to create a schema from a text string.
  static newSchemaFromText(text, numstart=0) {
    //console.log("newSchemaFromText", { text, numstart } );
    return new ConfigSchema(text, numstart);
  }
  // Factory method to create a schema from a data reference.
  // Used to recreate the schema from the state saved with vscode.setState()
  // when re-showing the editor.
  static newSchemaFromDataBySection(data) {
    //console.log("newSchemaFromDataBySection", data);
    const instance = new ConfigSchema();
    instance.setDataBySection(data);
    instance.refreshAllRequires();
    return instance;
  }

  // Utility method to fix up an options string so it can be JSON parsed.
  static cleanOptions(opts) {
    if (/\[\s*\d\s*:\s*['"]/.test(opts))
      opts = opts.replace('[', '{').replace(']', '}');
    return opts;
  }

  /**
   * Utility method to reduce the given config text down to just
   * preprocessor directive lines, removing all block comments.
   * This makes the text much faster to parse.
   * Don't apply if you need to preserve comments and line numbers.
   * Return an object with the stripped text and the number of lines.
   */
  static strippedConfig(config) {
    let text = '', count = 0, addnext = false;
    const lines = config.replace(/\/\*.+?\*\//).split('\n'); // Strip block comments, split into lines
    for (const line of lines) {
      if (addnext)                              // Previous line ended with '\'
        text += ' ';
      else if (!line.match(/^\s*(\/\/)?\s*#/))  // Only keep lines starting with '#' or '//#'
        continue;
      addnext = (/\\$/.test(line));             // New line ends with '\'?
      text += line.replace(/\ *\\$/, '');       // Add the line to the text, minus trailing '\'
      if (!addnext) {
        text += '\n';                           // Terminate if it didn't end with '\'
        count++;                                // Count up the number of lines
      }
    }
    text = text.replace('@section', '_section') // Remove @section markers
    return { text:text, lines:count };
  }

  /**
   * Sections with emojis to pretty up the UI.
   *
   *  👁 🤞 👤 👮‍♀️ 🥷 🎅 😱 😷 💩 👽 ☠️ 👾 🤖 🫵 👥 🧠 🗣 👩‍💻 🧜‍♀️ 🤷
   *  🦺 👔 👑 👓 🧢 🕶 🥽 💼 🎩 🧤 🦄 🐝 🐛 🐌 🐢 🐙 📁 💾 📺 ⏰
   *  ⏱ 🧭 📷 🪣 ⏰ 🔋 ⚓️ 🚦 🚑 🚗 🚀 💡 🔌 🔧 🔨 🧰 ⚒ 🛠 ⚙️ 🔑 💊
   *  💣 📦 📖 ✏️ 📝 ❤️ 🆘 ❌ ✅ 🚸 ⚠️ ❓ ❗️ ▶️ ⏸ ⏹ 🎵 🕓 🇺🇦🇬🇧🇺🇸🇨🇦 ⚡️
   *  🗑 🏛 ✈️ 🛸 🚜 🧩 🎲 🎮 🎱 🍿 🍔 🍊 🍅 ☂️ ☘️ 🍀 🦤 🪲 🕷 🤓 ☝️
   *
   */
  static sectionOrderWithEmojis = {
    '__': '❓',
    '_': '❓',
    'test': '🧪',
    'custom': '👤',
    'user': '👤',
    'none': '❓',

    'info': 'ℹ️',
    'machine': '🤖',
    'eeprom': '💾',

    'stepper drivers': '🛞',
    'multi stepper': '🛞',
    'idex': '👥',
    'extruder': '💩',

    'geometry': '📐',
    'homing': '🏠',
    'kinematics': '⚙️',
    'motion': '🏃‍♂️‍➡️',
    'motion control': '🏃‍♂️‍➡️',

    'endstops': '🛑',
    'filament runout sensors': '🚨',
    'probe type': '🛰',
    'probes': '🛰',
    'bltouch': '🇰🇷',
    'leveling': '🫓',

    'temperature': '🌡',
    'hotend temp': '🌡',
    'mpctemp': '🌡',
    'pid temp': '🌡',
    'mpc temp': '🌡',
    'bed temp': '🌡',
    'chamber temp': '🌡',
    'fans': '❄️',

    'tool change': '🔧',
    'advanced pause': '⏯️',
    'calibrate': '🔍',
    'calibration': '🔍',

    'media': '💾',

    'lcd': '🖥',
    'lights': '💡',
    'caselight': '💡',
    'interface': '🎛️',
    'custom main menu': '🔧',
    'custom config menu': '🔧',
    'custom buttons': '🔘',

    'develop': '🛠',
    'debug matrix': '🪲',

    'delta': '✈️',
    'scara': '🦄',
    'tpara': '🦄',
    'polar': '🐧',
    'polargraph': '📈',
    'cnc': '🪚',

    'nozzle park': '🚗',
    'nozzle clean': '🚿',

    'gcode': '🎱',

    'serial': '🥣',
    'host': '🐙',

    'filament width': '📏',
    'i2c encoders': '👀',
    'i2cbus': '🚌',
    'joystick': '🕹',
    'multi-material': '🍔',
    'nanodlp': '🦤',
    'network': '🕸',
    'photo': '📷',
    'power': '⚡️',
    'psu control': '🔌',
    'reporting': '💬',
    'safety': '🚧',
    'security': '🔑',
    'servos': '🦾',
    'stats': '📊',

    'tmc/config': '😎',
    'tmc/hybrid': '😎',
    'tmc/serial': '😎',
    'tmc/smart': '😎',
    'tmc/spi': '😎',
    'tmc/stallguard': '😎',
    'tmc/status': '😎',
    'tmc/stealthchop': '😎',
    'tmc/tmc26x': '😎',

    'units': '🇺🇳',
    'volumetrics': '🎚',

    'extras': '👽'
  };

  /**
   * Utility method to get a pre-ordered dictionary of empty sections.
   * This pre-determines the order that sections will be scanned and
   * appear in the UI. Adjust as needed to put more relevant sections first.
   */
  static emptyOrderedData() {
    // Create a dictionary of empty sections in the order above.
    let dict = {};
    for (const s of Object.keys(ConfigSchema.sectionOrderWithEmojis)) dict[s] = {};
    return dict;
  }

  /**
   * Return an emoji to dress up the given section.
   */
  static sectionEmoji(s) {
    return ConfigSchema.sectionOrderWithEmojis[s] ?? "🍅";
  }

  //
  // Schema Accessors API
  //

  /**
   * @brief Is the given item fully defined before the given sid?
   *
   * @param {info}   item    The item to query.
   * @param {int}    before  The sid it must precede.
   * @return True if the item is fully defined before the given sid.
   */
  static definedBefore(item, sid_before) {
    if (!sid_before) return true;
    if (item.sid >= sid_before) return false;
    if (item?.enabled === false) return false;
    if (item?.evaled === false) return false;
    if ((item.undef ?? Infinity) < sid_before) return false;
    return true;
  }

  /**
   * @brief Get all items that pass the given test function, in schema order.
   *
   * @param {string}   sect    A section name such as "machine".
   * @param {function} fn      A function like: (itm) => { return itm.type == "string"; }
   * @param {int}      before  The maximum sid to consider. (optional)
   * @param {int}      limit   The maximum number of items to return. (optional)
   * @return Array of item references.
   */
  getItemsInSection(sect, fn, before, limit=0) {
    log(`getItemsInSection(${sect}, ..., ${before}, ${limit})`);
    let results = [];
    for (const item of this.iterateSectionItems(this.bysec[sect])) {
      if (ConfigSchema.definedBefore(item, before) && fn(item)) {
        results.push(item);
        if (limit && results.length >= limit) break;
      }
    }
    return results;
  }

  /**
   * @brief Get all items that pass the given test function, in schema order.
   *
   * @param {function} fn A function like: (itm) => { return itm.type == "string"; }
   * @param {int} before The maximum sid to consider. (optional)
   * @param {int} limit The maximum number of items to return. (optional)
   * @return Array of item references.
   */
  getItems(fn, before, limit=0) {
    let results = [];
    for (const item of this.iterateDataBySID()) {
      if (ConfigSchema.definedBefore(item, before) && fn(item)) {
        results.push(item);
        if (limit && results.length >= limit) break;
      }
    }
    return results;
  }

  /**
   * Find the first item in the schema with a given name before an optional sid.
   * The item will be enabled and not since undefined.
   *
   * @param {string} name Name of the item to find.
   * @param {int} before The last index allowed for the item.
   * @return The item found, or null.
   */
  firstItemWithName(name, before=Infinity) {
    log(`firstItemWithName(${name}, ${before})`);
    return this.firstItem(it => it.name === name && ConfigSchema.definedBefore(it, before));
  }

  /**
   * Find by name the last defined (and not since undefined) item in the schema before an optional sid.
   *
   * @param {string} name Name of the item to find.
   * @param {int} before The last index allowed for the item.
   * @return The item found, or null.
   */
  lastItemWithName(name, before=Infinity) {
    log(`lastItemWithName(${name}, ${before})`);
    return this.lastItem(it => it.name === name && ConfigSchema.definedBefore(it, before));
  }

  /**
   * Various options for distinct selection
   */
  static exclusive = {
    // U8GLIB
    u8glib: ['U8GLIB_SSD1306', 'U8GLIB_SH1106'],

    // LCD Names
    lcd: [
      'REPRAP_DISCOUNT_SMART_CONTROLLER',
      'YHCB2004',
      'RADDS_DISPLAY',
      'ULTIMAKERCONTROLLER',
      'ULTIPANEL',
      'PANEL_ONE',
      'G3D_PANEL',
      'RIGIDBOT_PANEL',
      'MAKEBOARD_MINI_2_LINE_DISPLAY_1602',
      'ZONESTAR_LCD', 'ANET_KEYPAD_LCD',
      'ULTRA_LCD',
      'RA_CONTROL_PANEL',
      'LCD_SAINSMART_I2C_1602', 'LCD_SAINSMART_I2C_2004', 'LCD_I2C_SAINSMART_YWROBOT',
      'LCM1602',
      'LCD_I2C_PANELOLU2',
      'LCD_I2C_VIKI',
      'SAV_3DLCD',
      'FF_INTERFACEBOARD',
      'TFTGLCD_PANEL_SPI', 'TFTGLCD_PANEL_I2C',
      'REPRAP_DISCOUNT_FULL_GRAPHIC_SMART_CONTROLLER',
      'K3D_FULL_GRAPHIC_SMART_CONTROLLER',
      'REPRAPWORLD_GRAPHICAL_LCD',
      'VIKI2', 'miniVIKI',
      'WYH_L12864',
      'MINIPANEL', 'MAKRPANEL',
      'ELB_FULL_GRAPHIC_CONTROLLER',
      'BQ_LCD_SMART_CONTROLLER',
      'CARTESIO_UI',
      'LCD_FOR_MELZI',
      'ULTI_CONTROLLER',
      'MKS_MINI_12864', 'MKS_MINI_12864_V3',
      'MKS_LCD12864A', 'MKS_LCD12864B',
      'FYSETC_MINI_12864_X_X', 'FYSETC_MINI_12864_1_2',
      'FYSETC_MINI_12864_2_0', 'FYSETC_MINI_12864_2_1',
      'FYSETC_GENERIC_12864_1_1',
      'BTT_MINI_12864', 'BEEZ_MINI_12864', 'BTT_MINI_12864_V1',
      'CR10_STOCKDISPLAY', 'ENDER2_STOCKDISPLAY',
      'ANET_FULL_GRAPHICS_LCD', 'ANET_FULL_GRAPHICS_LCD_ALT_WIRING',
      'CTC_A10S_A13',
      'AZSMZ_12864',
      'SILVER_GATE_GLCD_CONTROLLER',
      'EMOTION_TECH_LCD',
      'U8GLIB_SSD1306', // top-level only
      'SAV_3DGLCD',
      'OLED_PANEL_TINYBOY2',
      'MKS_12864OLED', 'MKS_12864OLED_SSD1306',
      'ZONESTAR_12864LCD', 'ZONESTAR_12864OLED', 'ZONESTAR_12864OLED_SSD1306',
      'U8GLIB_SH1106_EINSTART',
      'OVERLORD_OLED',
      'FYSETC_242_OLED_12864',
      'K3D_242_OLED_CONTROLLER',
      'DGUS_LCD_UI', 'DGUS_LCD',
      'MALYAN_LCD',
      'TOUCH_UI_FTDI_EVE', 'LULZBOT_TOUCH_UI',
      'ANYCUBIC_LCD_CHIRON', 'ANYCUBIC_LCD_I3MEGA', 'ANYCUBIC_LCD_VYPER', 'ANYCUBIC_TFT_MODEL',
      'SOVOL_SV06_RTS',
      'NEXTION_TFT',
      'EXTENSIBLE_UI',
      'MKS_TS35_V2_0',
      'MKS_ROBIN_TFT24', 'MKS_ROBIN_TFT28', 'MKS_ROBIN_TFT32', 'MKS_ROBIN_TFT35', 'MKS_ROBIN_TFT43',
      'MKS_ROBIN_TFT_V1_1R', 'MKS_ROBIN_TFT',
      'TFT_TRONXY_X5SA',
      'ANYCUBIC_TFT35',
      'LONGER_LK_TFT28',
      'ANET_ET4_TFT28', 'ANET_ET5_TFT35',
      'BIQU_BX_TFT70',
      'BTT_TFT35_SPI_V1_0',
      'TFT_GENERIC',
      'TFT_CLASSIC_UI', 'TFT_COLOR_UI', 'TFT_LVGL_UI', 'TFT_LVGL_UI_FSMC', 'TFT_LVGL_UI_SPI',
      'FSMC_GRAPHICAL_TFT', 'SPI_GRAPHICAL_TFT', 'TFT_320x240', 'TFT_320x240_SPI', 'TFT_480x320', 'TFT_480x320_SPI',
      'DWIN_CREALITY_LCD', 'DWIN_LCD_PROUI', 'DWIN_CREALITY_LCD_JYERSUI', 'DWIN_MARLINUI_PORTRAIT', 'DWIN_MARLINUI_LANDSCAPE'
    ],

    // TFT Interfaces
    tft_if: ['TFT_INTERFACE_FSMC', 'TFT_INTERFACE_SPI'],
    // TFT Resolutions
    tft_res: ['TFT_RES_320x240', 'TFT_RES_480x272', 'TFT_RES_480x320', 'TFT_RES_1024x600'],
    // TFT UIs
    tft_ui: ['TFT_COLOR_UI', 'TFT_CLASSIC_UI', 'TFT_LVGL_UI'],
    // Chiron TFTs
    tft_chiron: ['CHIRON_TFT_STANDARD', 'CHIRON_TFT_NEW'],

    // RGB or RGBW
    rgbled: ['RGB_LED', 'RGBW_LED'],

    // Hotend temperature control methods
    temp_control: ['PIDTEMP', 'MPCTEMP'],

    // Probe types
    probe: [
      'PROBE_MANUALLY',
      'BLTOUCH', 'BD_SENSOR',
      'FIX_MOUNTED_PROBE', 'NOZZLE_AS_PROBE',
      'TOUCH_MI_PROBE',
      'SOLENOID_PROBE',
      'Z_PROBE_ALLEN_KEY', 'Z_PROBE_SLED',
      'RACK_AND_PINION_PROBE',
      'SENSORLESS_PROBING',
      'MAGLEV4', 'MAG_MOUNTED_PROBE',
      'BIQU_MICROPROBE_V1', 'BIQU_MICROPROBE_V2'
    ],

    // Leveling methods
    leveling: [
      'AUTO_BED_LEVELING_3POINT',
      'AUTO_BED_LEVELING_LINEAR',
      'AUTO_BED_LEVELING_BILINEAR',
      'AUTO_BED_LEVELING_UBL',
      'MESH_BED_LEVELING',
    ],

    // Kinematics / Machine Types
    kinematic: [
      'DELTA',
      'MORGAN_SCARA', 'MP_SCARA', 'AXEL_TPARA',
      'COREXY', 'COREXZ', 'COREYZ', 'COREYX', 'COREZX', 'COREZY',
      'MARKFORGED_XY', 'MARKFORGED_YX',
      'ARTICULATED_ROBOT_ARM', 'FOAMCUTTER_XYUV', 'POLAR'
    ],

    // Extruder/Toolhead Types
    switching_nozzle: ['SWITCHING_NOZZLE', 'MECHANICAL_SWITCHING_NOZZLE'],
    switching_extruder: ['SWITCHING_EXTRUDER', 'MECHANICAL_SWITCHING_EXTRUDER'],
    toolhead: [
      'SINGLENOZZLE',
      'DUAL_X_CARRIAGE',
      'PARKING_EXTRUDER', 'MAGNETIC_PARKING_EXTRUDER',
      'SWITCHING_TOOLHEAD', 'MAGNETIC_SWITCHING_TOOLHEAD', 'ELECTROMAGNETIC_SWITCHING_TOOLHEAD'
    ],

    // Axis Homing Submenus
    lcd_homing: ['INDIVIDUAL_AXIS_HOMING_MENU', 'INDIVIDUAL_AXIS_HOMING_SUBMENU'],

    // Digital Potentiometers
    digipot: ['DIGIPOT_MCP4018', 'DIGIPOT_MCP4451']
  };

  /**
   * Get the group an item should belong to, by name.
   * There may be exceptions. e.g., Only the top level U8GLIB_SSD1306 should be in the "lcd" radio group.
   * If an item shows up more than once in a configuration
   * file, it may belong to different groups, so the logic
   * should be expanded for known special cases.
   *
   * @param {info} item Item info to get the group for.
   * @returns The name of the group, or null.
   */
  itemGroup(item) {
    // U8GLIB
    if (ConfigSchema.exclusive.u8glib.includes(item.name)) return item?.depth ? 'sav-u8glib' : 'lcd';

    // LCD Names
    if (ConfigSchema.exclusive.lcd.includes(item.name)) return item?.depth ? null : 'lcd';

    // TFT Interfaces
    if (ConfigSchema.exclusive.tft_if.includes(item.name)) return 'tft-if';

    // TFT Resolutions
    if (ConfigSchema.exclusive.tft_res.includes(item.name)) return 'tft-res';

    // TFT UIs
    if (ConfigSchema.exclusive.tft_ui.includes(item.name)) return 'tft-ui';

    // Chiron TFTs
    if (ConfigSchema.exclusive.tft_chiron.includes(item.name)) return 'tft-chiron';

    // RGB or RGBW
    if (ConfigSchema.exclusive.rgbled.includes(item.name)) return 'rgbled';

    // Hotend temperature control methods
    if (ConfigSchema.exclusive.temp_control.includes(item.name)) return 'temp-control';

    // Probe types
    if (ConfigSchema.exclusive.probe.includes(item.name)) return 'probe';

    // Leveling methods
    if (ConfigSchema.exclusive.leveling.includes(item.name)) return 'leveling';

    // Kinematics / Machine Types
    if (ConfigSchema.exclusive.kinematic.includes(item.name)) return 'kinematics';

    // Extruder/Toolhead Types
    if (ConfigSchema.exclusive.switching_nozzle.includes(item.name)) return 'nozzles';
    if (ConfigSchema.exclusive.switching_extruder.includes(item.name)) return 'switching';
    if (ConfigSchema.exclusive.toolhead.includes(item.name)) return 'toolhead';

    // Axis Homing Submenus
    if (ConfigSchema.exclusive.lcd_homing.includes(item.name)) return 'lcd-homing';

    // Digital Potentiometers
    if (ConfigSchema.exclusive.digipot.includes(item.name)) return 'digipot';

    // Return null for all other items.
    return null;
  }

  /**
   * @brief Evaluate the 'requires' field of an item.
   * @description The 'initem' is a single entry in the schema data.
   *              Evaluate a single condition string based on previous enabled options.
   *              This recurses as needed to check nested conditions, with prior
   *              evaluations being cached.
   * @param {object} initem The item to evaluate w/r/t the full schema.
   */
  evaluateRequires(initem) {
    // TODO: For Configuration_adv.h we'll need to open and scan Configuration.h,
    // which can slow things down a bit for that file. If the file is open in the
    // other editor, maybe that can be skipped by passing messages between the
    // windows by some intermediary.

    // A cond string is a list of conditions using Marlin macros that we can
    // convert into JavaScript and eval. Later we can try to interpret, but for
    // now it's much easier to let eval do all the hard work.

    // If already evaluated, return the last result.
    // To refresh the result, delete the 'evaled' key.
    if ('evaled' in initem) return initem.evaled;

    // If no conditions, return true.
    if (!('requires' in initem)) return true;

    // Conditions are general C++ preprocessor macros.
    let cond = initem.requires;

    const istrue = ['', '1', 'true'],
         isfalse = ['0', 'false'];

    // No evaluation required for simple conditions.
    if (istrue.includes(cond)) return true;
    if (isfalse.includes(cond)) return false;

    //log("evaluateRequires"); if (verbose) console.dir(initem);

    // Convenience accessor for this instance
    const self = this;

    // Last item, by name, before the evaluated item.
    function priorItemNamed(name, before=initem.sid) { return self.lastItemWithName(name, before); }

    // Is a single item defined before the current line?
    function _defined(item) {
      //log(`_defined(${item.name})`);
      if (!item.enabled) return false;
      if (item.sid >= initem.sid) return false;
      if ('undef' in item) return false;
      return self.evaluateRequires(item);
    }

    // Is a single item enabled? (defined and has no value, 1, or true)
    function _enabled(item) {
      //log(`_enabled(${item.name})`);
      if (!_defined(item)) return false;
      if (item.value === undefined) return true;
      return istrue.includes(item.value);
    }

    // Are all given defines existing and enabled?
    const defined = (...V) => V.every(
      name => self.iterateItemsWithName(name).some(item => _defined(item))
    );

    // Are the given items all enabled?
    const ENABLED = (...V) => V.every(
      name => self.iterateItemsWithName(name).some(item => _enabled(item))
    );

    // Are the given items all disabled?
    const DISABLED = (...V) => V.every(
      name => self.iterateItemsWithName(name).every(item => !_enabled(item))
    );

    // Are any of the given items enabled?
    const ANY = (...V) => V.some(name => ENABLED(name));
    const COUNT_ENABLED = (...V) => V.reduce((count, name) => count + ENABLED(name), 0);
    const MANY = (...V) => COUNT_ENABLED(...V) > 1;
    const NONE = DISABLED, ALL = ENABLED, BOTH = ENABLED, EITHER = ANY;

    // Produce an adjacent integer
    const INCREMENT = val => val * 1 + 1,
          DECREMENT = val => val * 1 - (val * 1 > 0);

    // Is MOTHERBOARD any one of the boards provided?
    const MB = (...V) => V.includes(priorItemNamed('MOTHERBOARD')?.value.replace(/^BOARD_/, '') ?? '');

    ///// Conditions based on other criteria, e.g., item.name /////

    function _nonzero(name) {
      const item = priorItemNamed(name);
      //console.log(`_nonzero(${name})`, item);
      if (!item?.value) return false;
      if (item.value === 'false') return false;
      if (item.value === '0') return false;
      return true;
    }

    // [AXIS]_DRIVER_TYPE is enabled. For older config versions
    // we can check the value of NUM_AXES or LINEAR_AXES.
    function HAS_AXIS(axis) {
      const driver = priorItemNamed(`${axis}_DRIVER_TYPE`);
      return driver !== null;
    }

    // The item is enabled by its E < EXTRUDERS.
    function HAS_EAXIS(eindex) {
      const extruders = priorItemNamed('EXTRUDERS') || priorItemNamed('EXTRUDERS', Infinity);
      if (extruders == null) return false;
      const stat = eindex < extruders.value;
      //console.log(`HAS_EAXIS(${eindex}) == ${stat ? 'true' : 'false'}`, extruders);
      return stat;
    }

    // The item is enabled by TEMP_SENSOR_[NAME] != 0.
    const HAS_SENSOR = (name) => _nonzero(`TEMP_SENSOR_${name}`);

    // Some enabled sensor matches the given number.
    function _has_sensor(num) {
      return 0 < self.countPriorItems(
        it => it.name.startsWith('TEMP_SENSOR_') && it.value == num, initem.sid, 1
      );
    }
    const ANY_THERMISTOR_IS = (...V) => V.some(num => _has_sensor(num));

    // The serial port was defined. (deprecated)
    function HAS_SERIAL(sindex) {
      return priorItemNamed(sindex === '0' ? 'SERIAL_PORT' : `SERIAL_PORT_${sindex}`) != null;
    }

    ////// Other macros appearing in #if conditions //////

    // The driver type for the given axis matches the given enum.
    function AXIS_DRIVER_TYPE(adata) {
      const axis = adata[0], type = adata[1];
      if (axis.startsWith('E')) {
        const extruders = priorItemNamed('EXTRUDERS');
        if (extruders == null) return false;
        if (axis.slice(1) >= extruders.value) return false;
      }
      const driver = priorItemNamed(`${axis}_DRIVER_TYPE`);
      return (driver?.value === type);
    }

    // The temp sensor for the given heater/cooler is a thermocouple.
    function TEMP_SENSOR_IS_MAX_TC(name) {
      const sensor = priorItemNamed(`TEMP_SENSOR_${name}`);
      if (!sensor) return false;
      const result = ['-5', '-3', '-2', -5, -3, -2].includes(sensor?.value);
      return result;
    }
    const HAS_MAX_TC = () => { return TEMP_SENSOR_IS_MAX_TC('0') || TEMP_SENSOR_IS_MAX_TC('1') || TEMP_SENSOR_IS_MAX_TC('2') || TEMP_SENSOR_IS_MAX_TC('BED') || TEMP_SENSOR_IS_MAX_TC('REDUNDANT'); };

    const UNUSED_TEMP_SENSOR = (index) => {
      const sensor = priorItemNamed(`TEMP_SENSOR_${index}`);
      if (!sensor) return true;
      const hotends = priorItemNamed('HOTENDS') || 0;
      return index >= hotends;
    };

    // Some enabled driver matches the given enum.
    function _has_driver(type) {
      return 0 < self.countPriorItems(
        it => it.name.endsWith('_DRIVER_TYPE') && it.value === type, initem.sid, 1
      );
    }
    const HAS_DRIVER = (...V) => V.some(type => _has_driver(type));

    // The given axis is a Trinamic driver.
    function AXIS_IS_TMC_CONFIG(axis) {
      const driver = priorItemNamed(`${axis}_DRIVER_TYPE`);
      return ['TMC2130', 'TMC2160', 'TMC2208', 'TMC2209', 'TMC2660', 'TMC5130', 'TMC5160'].includes(driver?.value);
    }

    // DGUS_UI_IS for DGUS_LCD_UI
    function _dgus_ui_is(dgus) {
      const lcd = priorItemNamed('DGUS_LCD_UI');
      return (lcd?.value === dgus);
    }
    const DGUS_UI_IS = (...V) => V.some(name => _dgus_ui_is(name));

    // Loose names may be in the schema or be defined by Conditionals-2-LCD.h
    function OTHER(name) {
      // See if the item is enabled in the schema and use its value.
      const it = self.firstItem(it => ConfigSchema.definedBefore(it, initem.sid) && it.name === name);
      if (it) {
        if (it.type === 'macro') {
          const match = it.value.match(/(\w+)\s*\(([^()]*?)\)/),
                parms = match[2].replace(/(\w+)/g, "'$1'"),
                macro = `${match[1]}(${parms})`;
          //console.log(`Evaluating macro ${it.name} == ${macro}`);
          return eval(macro);
        }
        return (['int', 'float'].includes(it.type)) ? it.value * 1 : it.value;
      }

      // Do custom handling for items not found in the schema.
      switch (name) {
        case 'HAS_E_TEMP_SENSOR':
          for (let i = 0; i < priorItemNamed('EXTRUDERS')?.value; i++)
            if (priorItemNamed(`TEMP_SENSOR_${i}`)?.value) return true;
          return false;

        case 'XY': return 2;
        case 'XYZ': return 3;

        case 'HAS_TRINAMIC_CONFIG':
          return HAS_DRIVER('TMC2130', 'TMC2160', 'TMC2208', 'TMC2209', 'TMC2660', 'TMC5130', 'TMC5160');

        default:
          if (name.startsWith('TEMP_SENSOR_'))
            return HAS_SENSOR(name.slice(12));

          //console.warn(`Unknown: OTHER("${name}")`);
          break;
      }
      return false;
    }

    /**
     * Concatenate literal comma-separated parts and return
     * the OTHER() evaluation of the resulting symbol.
     * Example:
     *   #define ALICE 123
     *   #define DOCAT_(V) _CAT(_,V)
     *   #define DIDCAT DOCAT_(ALICE) // DIDCAT => _ALICE
     */
    const _CAT = (...V) => OTHER(V.join(''));

    /**
     * Concatenate the solved values of comma-separated parts
     * and return the OTHER() evaluation of the resulting symbol.
     * Example:
     *   #define ALICE MY_ENUM
     *   #define BOB ALICE
     *   #define DOCAT(V) CAT(_,V)
     *   #define DIDCAT DOCAT(BOB) // DIDCAT == _MY_ENUM
     */
    function CAT(...parts) {
      //console.log("ABM => CAT", parts);
      // Evaluate each part before concatenation
      const solved = [];
      for (const part of parts) {
        let priorValue = part,                      // Assume the literal part
            prior = priorItemNamed(part);           // Get the prior named item, if any
        while (prior) {                             // If the symbol is defined...
          priorValue = prior.value;                 // ...use its value.
          if (prior.type !== 'enum') break;          // Is it the name of an enum?
          prior = priorItemNamed(priorValue);       // Keep going down the rabbit hole
        }
        solved.push(priorValue);
      }

      return OTHER(solved.join(''));
    }

    /**
     * Find MAP(...) macros and expand them
     * Example:
     *      #define CB(N) (BLAH(N) && HAS_## N ##_AXIS) ||
     *      #if MAP(CB, X, Y, Z) 0
     *   => #if (BLAH(X) && HAS_X_AXIS) || (BLAH(Y) && HAS_Y_AXIS) || (BLAH(Z) && HAS_Z_AXIS) || 0
     */
    function expand_MAP(cond) {
      const mappatt = /(MAP\((([^)]+))\))/g;
      let res;
      while (res = mappatt.exec(cond)) {
        const maparr = res[2].split(/\s*,\s*/),
              fn = maparr.shift(),
              fninfo = priorItemNamed(fn),
              fnpar = fninfo.value.match(/^\(([^)]+)\)\s*(.*)/),
              fnarg = fnpar[1], fntpl = fnpar[2],
              regp = new RegExp(`(##\\s*${fnarg}\\s*##|##\\s*${fnarg}\\b|\\b${fnarg}\\s*##)`, 'g');
        let exp = '';
        for (let n of maparr) exp += fntpl.replace(regp, n);
        cond = cond.replace(res[0], exp);
        //console.log("Map", { maparr, fn, fninfo, fnarg, fntpl, exp });
      }
      return cond;
    }

    /**
     * Find REPEAT(...) macros and expand them
     * Example:
     *      #define EXTRUDERS 3
     *      . . .
     *      #define _TODO(N,T) && ((N) < (T) * 2)
     *      #define _ALSO(N) && ((N) < 10)
     *      #if 1 REPEAT(EXTRUDERS, _ALSO)
     *   => #if 1 && ((0) < 10) && ((1) < 10) && ((2) < 10)
     *
     *  - R?REPEAT_S(2,5,_ALSO) ........  && ((2) < 10) && ((3) < 10) && ((4) < 10)
     *  - R?REPEAT(3,_ALSO) ............  && ((0) < 10) && ((1) < 10) && ((2) < 10)
     *  - R?REPEAT_1(3,_ALSO) ..........  && ((1) < 10) && ((2) < 10) && ((3) < 10)
     *  - R?REPEAT2_S(2,4,_TODO,4) .....  && ((2) < (4) * 2) && ((3) < (4) * 2)
     *  - R?REPEAT2(2,_TODO,4) .........  && ((0) < (4) * 2) && ((1) < (4) * 2)
     */
    function expand_REPEAT(cond) {
      const reppatt = /\bR?REPEAT(|_1|_S|2|2_S)\(((\w+\s*\([^()]*\)|[^()]+)(\s*,\s*(\w+\([^()]*\)|[^()]+))*)\)/g;
      let res;
      while (res = reppatt.exec(cond)) {
        const reptype = res[1],
              rargs = res[2].split(/\s*,\s*/);
        let low = 0, high = 0, less = 1, args = false;
        switch (reptype) {
          case '2':   args = true;            // REPEAT2(N,FN,...)
          case '':    high = rargs.shift();   // REPEAT(N,FN)
                      break;
          case '_1':  low = 1;                // REPEAT_1(N,FN)
                      high = rargs.shift();
                      less = 0;
                      break;
          case '2_S': args = true;            // REPEAT2_S(S,N,FN,...)
          case '_S':  low = rargs.shift();    // REPEAT_S(S,N,FN)
                      high = rargs.shift();
                      break;
        }
        // If 'low' is a SYMBOL_NAME_123_STR string, get its value
        if (typeof low === 'string' && low.match(/^[A-Z_][A-Z0-9_]*$/)) {
          const lowitem = priorItemNamed(low);
          low = lowitem ? lowitem.value : 0;
        }
        if (typeof high === 'string' && high.match(/^[A-Z_][A-Z0-9_]*$/)) {
          const highitem = priorItemNamed(high);
          high = highitem ? highitem.value : 0;
        }
        const fn = rargs.shift(),           // After this, rargs[] contains the extra args
              fninfo = priorItemNamed(fn),  // May take more than one argument
              fnpar = fninfo.value.match(/^\(([^)]+)\)\s*(.*)/),
              fnargs = fnpar[1].split(/\s*,\s*/), fntpl = fnpar[2];

        let exp = [];
        low = Number(low); high = Number(high) - less;
        for (let n = low; n <= high; ++n) {
          let args = [n, ...rargs], part = fntpl;
          for (let a of fnargs) {
            const regp = new RegExp(`(##\\s*${a}\\s*##|##\\s*${a}\\b|\\b${a}\\s*##)`, 'g');
            part = part.replace(regp, args.shift());
          }
          exp.push(part);
        }
        cond = cond.replace(res[0], exp.join(' '));
        //console.log("Repeat", { rargs, fn, fninfo, fnarg, fntpl, exp });
      }
      return cond;
    }

    /**
     * Find parentheses that wrap only one entity and
     * return their indexes in an array.
     */
    function findRedundantParentheses(code) {

      // Check if parentheses belong to a function call
      function isFunctionCall(code, openIndex) {
        let i = openIndex - 1;
        while (i >= 0 && (/\s/.test(code[i]))) i--;
        return i >= 0 && (/\w/.test(code[i])); // If a word character precedes '(', it's a function call
      }

      // Check if a pair of parentheses is unnecessary
      function isRedundant(code, openIndex, i, pairs) {
        // Paired parentheses form a unit
        if (pairs[openIndex + 1] == i - 1) return true;

        let inner = code.slice(openIndex + 1, i).trim();

        // Simple function call
        if (/^[a-z_]\w*\s*\([^)]*\)$/i.test(inner)) return true;

        // Number
        if (/^-?\d+(\.\d+)?$/.test(inner)) return true;

        // Single identifier
        if (/^[a-z_]\w*$/i.test(inner)) return true;

        // Anything else, including empty
        return false;
      }

      // Create a set describing redundant parentheses, return as a sorted array
      let inQuote = '', stack = [], redundant = new Set(), pairs = [];
      for (let i = 0; i < code.length; i++) {
        let char = code[i];

        // Handle characters in a string
        if (inQuote) {
          // Handle escaping within strings
          if (char === "\\" && i + 1 < code.length) i++; // Skip escaped character
          else if (char === inQuote) inQuote = '';
          continue;
        }

        if (char === '"' || char === "'") {
          inQuote = char;
        } else if (char === '(') {
          // Store the char index as belonging to a function or wrapper
          stack.push({ openIndex: i, type: isFunctionCall(code, i) ? 'fn' : 'normal' });
        } else if (char === ')' && stack.length > 0) {
          let { openIndex, type } = stack.pop();
          if (type === 'normal') {
            pairs[openIndex] = i;
            if (isRedundant(code, openIndex, i, pairs)) {
              redundant.add(openIndex);
              redundant.add(i);
            }
          }
        }
      }

      return Array.from(redundant).sort((a, b) => a - b);
    }

    // Return a new string with redundant parentheses removed
    function removeRedundantParentheses(code) {
      const redundantSet = new Set(findRedundantParentheses(code)); // Set for quick lookup
      let new_code = [];
      for (let i = 0; i < code.length; i++)
        if (!redundantSet.has(i)) new_code.push(code[i]); // Append char if it's not in redundant indices
      return new_code.join("");
    }

    // TEST CASES
    //let testcase1 = removeRedundantParentheses("(((notFromHere(ok) && ((FROM_HERE))))) || (FROG_SPIT)");
    //if (testcase1 !== "(notFromHere(ok) && FROM_HERE) || FROG_SPIT") console.warn("removeRedundantParentheses TEST 1 FAIL");
    //let testcase2 = removeRedundantParentheses("(((a + (b))))");
    //if (testcase2 !== "(a + b)") console.warn("removeRedundantParentheses TEST 2 FAIL");

    const before_mangle = cond;

    cond = expand_MAP(cond);
    cond = expand_REPEAT(cond);

    // Convert Marlin macros into JavaScript function calls:
    cond = cond
      .replace(/(AXIS_DRIVER_TYPE)_(\w+)\((.+?)\)/g, '$1($2,$3)')                   // AXIS_DRIVER_TYPE_X(A4988)  => AXIS_DRIVER_TYPE(X,A4988)
      .replace(/\b([A-Z_]\w*)\b(\s*([^(,]|$))/g, 'OTHER($1)$2')                     // LOOSE_SYMBOL               => OTHER(LOOSE_SYMBOL)
      .replace(/([A-Z_]\w+\s*\(|,\s*)OTHER\(([^()]+)\)/g, '$1$2')                   // ANYCALL(OTHER(ABCD)        => ANYCALL(ABCD    ... , OTHER(ABCD) => , ABCD
      .replace(/\b(defined)\b\s*\(?\s*OTHER\s*\(\s*([^()]+)\s*\)\s*\)?/g, '$1($2)') // defined.OTHER(ABCD).       => defined(ABCD)
      .replace(/\b([A-Z_]\w*)\b(?!\s*\()/gi, '"$1"')                                // ABCD (not followed by '(') => "ABCD"
      ;

    cond = removeRedundantParentheses(cond);

    try {
      //initem.requirez = cond;
      initem.evaled = eval(cond) ? true : false;
    }
    catch (e) {
      console.error(`Error evaluating: ${cond}\nBefore: ${before_mangle}\n`, e);
      // Default to true for safety, but log the error for debugging
      initem.evaled = true;
      initem.evalError = e.message;
    }

    //log(`${initem.name} -----${initem.evaled} == ${cond} ----------`);

    return initem.evaled;
  } // evaluateRequires

  // Evaluate the 'requires' field of every define to see if it
  // is ruled out by its presence in a conditional block.
  // Called at the end of importText to parse all 'requires'.
  refreshAllRequires() {
    for (const item of this.iterateDataBySID()) delete item.evaled;
    for (const item of this.iterateDataBySID()) this.evaluateRequires(item);
  }

  // Refresh all requires that follow a changed item.
  refreshRequiresAfter(after) {
    for (const item of this.iterateDataBySID(after + 1)) delete item.evaled;
    for (const item of this.iterateDataBySID(after + 1)) this.evaluateRequires(item);
  }

  // Remove all empty sections from the schema.
  // This followup step is needed as part of imposing our key order.
  removeUnusedSections() {
    const sdict = this.bysec;
    for (const sect of Object.keys(sdict))
      if (Object.keys(sdict[sect]).length === 0) delete sdict[sect];
  }

  // Update an item's fields from an (edited) item containing the sid and the fields to change.
  // Then re-run 'requires' on all items that follow the changed item to update 'evaled'.
  // NOTE: If any items are still shown/hidden based on later things then refresh ALL instead.
  updateEditedItem(changes, refresh=true) {
    Object.assign(this.bysid[changes.sid], changes);
    if (refresh) this.refreshRequiresAfter(changes.sid);
  }

  /**
   * @brief Init the schema data from Configuration text.
   *
   * @description The data is a dictionary keyed by the option name:
   *    section  (string) - Section where the item appears.
   *    name     (string) - Full option name (its key in the dictionary).
   *    enabled  (bool)   - False if the option is commented out.
   *    value    (any)    - Value of the item, if any.
   *    type     (string) - Type of the option (e.g. bool, int, float, macro, etc.)
   *    units    (string) - Units of the item, from the comment.
   *    options  (json)   - Options for the item, if any.
   *    depth    (int)    - Depth of the item in the structure.
   *    sid      (int)    - Serial index by order of addition to the structure.
   *    line     (int)    - 1-based line number of the item in the text.
   *    requires (string) - Conditions required to enable the item, if any.
   *    comment  (string) - Comment for the item, if any.
   *    notes    (string) - An additional comment for the item.
   *    evaled   (bool)   - Evaluated requirements (true if not possible).
   *    undef    (int)    - SID before an undef that undefined this item.
   * During form editing:
   *    dirty    (bool)   - Has the item been modified from its original enabled/value?
   *    orig     (dict)   - Original state of the item. Used for better "dirty" state.
   *                        May also be used to implement a restore widget on modified items.
   * When more than one occurrence of the same option exists in the same section, the item
   * is converted to a single-level array of occurrences. This makes them all show up
   * at the same place in the config form, but since only one can be enabled at a time,
   * the value and/or indentation may change as they are shown/hidden. While this works well
   * for the form, we don't keep such details in the config.ini, for example. So all instances
   * will be affected when config.ini is applied.
   *
   * @param text The text to parse.
   * @return A dictionary of structured data.
   */
  importText(text, numstart=0) {
    log("schema.importText");

    // Parsing states
    const Parse = {
      NORMAL: 0,        // No condition yet
      BLOCK_COMMENT: 1, // Looking for the end of the block comment
      EOL_COMMENT: 2,   // EOL comment started, maybe add the next comment?
      SLASH_COMMENT: 3, // Block-like comment, starting with aligned //
      GET_SENSORS: 4,   // Gathering temperature sensor options
      ERROR: 9          // Syntax error
    };

    // Load board names from boards.h
    //const boards = load_boards();
    const boards = [];

    // Init the schema data with the preferred section order.
    const sdict = ConfigSchema.emptyOrderedData();
    this.bysec = sdict;
    // Regex for #define NAME [VALUE] [COMMENT] with sanitized line
    const defgrep = /^(\/\/)?\s*(#define)\s+([A-Za-z_][A-Za-z0-9_]+)\s*(.*?)\s*(\/\/.+)?$/;
    // Defines to ignore
    const ignore = ['CONFIGURATION_H_VERSION', 'CONFIGURATION_ADV_H_VERSION', 'CONFIG_EXAMPLES_DIR', 'LCD_HEIGHT'];
    // Start with unknown state
    let state = Parse.NORMAL;
    // Serial ID
    let sid = 0;

    // Loop through files and parse them line by line
    let section = 'user',     // Current Settings section
        line_number = numstart, // Counter for the line number of the file
        conditions = [],      // Condition stack to track #if block levels
        if_depth = 0,         // Depth of the current #if block
        comment_buff = [],    // A temporary buffer for comments
        prev_comment = '',    // Copy before reset for an EOL comment
        options_json = '',    // A buffer for the most recent options JSON found
        oneshot_opt = false,  // The options came from end of line, so only apply once
        join_line = false,    // A flag that the line should be joined with the previous one
        line = '',            // A line buffer to handle \ continuation
        last_added_ref,       // Reference to the last added item
        line_start, line_end; // Start and end of the (joined) line in the file

    // Loop through the lines in the file
    for (let the_line of text.split(/\r?\n/)) {
      line_number++;

      // Clean the line for easier parsing
      the_line = the_line.trim();
      //log(the_line, line_number);

      if (join_line)    // A previous line is being made longer
        line += (line ? ' ' : '') + the_line;
      else {            // Otherwise, start the line anew
        line = the_line;
        line_start = line_number;
      }

      // If the resulting line ends with a \, don't process now.
      // Strip the end off. The next line will be joined with it.
      join_line = line.endsWith("\\");
      if (join_line) {
        line = line.slice(0, -1).trim();
        continue;
      }
      else
        line_end = line_number;

      // Get the match parts for a #define line
      const defmatch = line.match(defgrep);

      // Special handling for EOL comments after a #define.
      // At this point the #define is already digested and inserted,
      // so we have to extend it
      if (state === Parse.EOL_COMMENT) {
        if (defmatch == null && the_line.startsWith('//')) {
          // Continue to add onto the comment. No JSON is expected.
          comment_buff.push(the_line.slice(2).trim());
          log("... EOL comment", line_number);
        }
        else {
          if (last_added_ref) { // Ignore EOL comments before any #define
            // If the line is not a comment, we're done with the EOL comment
            const cstring = comment_buff.join('\n');
            // If the comment property exists treat the extra comment as "notes"
            if (last_added_ref.comment) {
              // A (block or slash) comment was already added
              last_added_ref.notes = cstring;
              //console.log("Extra comment", cstring);
            }
            else {
              last_added_ref.comment = cstring;
              //console.log("EOL comment", cstring);
            }
          }
          comment_buff = [];
          state = Parse.NORMAL;
          log("Ending EOL comment", line_number);
        }
      }

      /**
       * Process a comment line, update @section, JSON, comment array
       * @param  {string} c      The comment line, trimmed
       */
      function use_comment(c) {
        log(`use_comment(${c})`);
        if (c.startsWith(':')) {        // If the comment starts with : then it has magic JSON
          const d = c.slice(1).trim(),
              cbr = d.startsWith('{') ? c.lastIndexOf('}') : d.startsWith('[') ? c.lastIndexOf(']') : 0;
          if (cbr) {
            options_json = d.slice(0, cbr).trim();
            const cmt = c.slice(cbr + 1).trim();
            if (cmt !== '') comment_buff.push(cmt);
          }
        }
        else if (c.startsWith('@section'))    // Start a new section
          section = c.slice(8).trim();
        else if (!c.startsWith('========'))
          comment_buff.push(c);
      }

      // For slash comments, capture consecutive slash comments.
      // The comment will be applied to the next #define.
      if (state === Parse.SLASH_COMMENT) {
        if (defmatch == null && the_line.startsWith('//')) {
          use_comment(the_line.slice(2).trim());
          log("... Slash comment", line_number);
          continue;
        }
        else {
          log("Ended slash comment", line_number);
          state = Parse.NORMAL;
        }
      }

      // In a block comment, capture lines up to the end of the comment.
      // The comment will be applied to the next #define.
      let cline = '';
      if ([Parse.BLOCK_COMMENT, Parse.GET_SENSORS].includes(state)) {

        const endpos = line.indexOf('*/');
        if (endpos < 0)
          cline = line;
        else {
          cline = line.slice(0, endpos).trim();
          line = line.slice(endpos + 2).trim();

          // Temperature sensors are done
          if (state === Parse.GET_SENSORS) {
            // Get up to the last 2 characters of the options_json string
            options_json = `{ ${options_json.slice(0, -2)} }`;
          }

          state = Parse.NORMAL;
          log("End block comment", line_number);
        }

        // Strip the leading '*' from block comments
        cline = cline.replace(/^\*\ ?/, '');

        const tline = cline.trim();

        // Collect temperature sensors
        if (state === Parse.GET_SENSORS) {
          const sens = tline.match(/^(-?\d+)\s*:\s*(.+)$/);
          if (sens) {
            //log(`Sensor: ${sens[1]} = ${sens[2]}`, line_number);
            const s2 = sens[2].replace(/(['"])/g, "\\$1");
            options_json += `'${sens[1]}':'${sens[1]} - ${s2}', `;
          }
        }
        else if (state === Parse.BLOCK_COMMENT) {
          // Look for temperature sensors
          if (tline.match(/temperature\ sensors.*:/i)) {
            state = Parse.GET_SENSORS;
            cline = "Temperature Sensors";
            //log("Starting sensors list", line_number);
          }
          use_comment(cline);
        }
      } // end COMMENT, SENSORS
      // For the normal state we're looking for any non-blank line
      else if (state === Parse.NORMAL) {
        // Skip a commented define when evaluating comment opening
        const st = line.match(/^\/\/\s*#define/) ? 2 : 0,
          cpos1 = line.indexOf('/*'),      // Start a block comment on the line?
          cpos2 = line.indexOf('//', st);  // Start an end of line comment on the line?

        // Only the first comment starter gets evaluated
        let cpos = -1;
        if (cpos1 !== -1 && (cpos1 < cpos2 || cpos2 === -1)) {
          cpos = cpos1;
          state = Parse.BLOCK_COMMENT;
          oneshot_opt = false;
          log("Begin block comment", line_number);
        }
        else if (cpos2 !== -1 && (cpos2 < cpos1 || cpos1 === -1)) {
          cpos = cpos2;
          // Comment after a define may be continued on the following lines
          if (defmatch != null && cpos > 10) {
            state = Parse.EOL_COMMENT;
            prev_comment = comment_buff.join('\n');
            comment_buff = [];
            log("Begin EOL comment", line_number);
          }
          else {
            state = Parse.SLASH_COMMENT;
            log(`Begin slash comment (column ${cpos})`, line_number);
          }
        }

        // Process the start of a new comment
        if (cpos !== -1) {
          comment_buff = [];
          cline = line.slice(cpos + 2).trim();
          line = line.slice(0, cpos).trim();

          if (state === Parse.BLOCK_COMMENT) {
            // Strip leading '*' from block comments
            cline = cline.replace(/^\*\ ?/, '');
          }
          else {
            // Expire end-of-line options after first use
            if (cline.startsWith(':')) oneshot_opt = true;
          }

          // Buffer a non-empty comment start
          if (cline !== '') use_comment(cline);
        }

        // If the line has nothing before the comment, go to the next line
        if (line === '') {
          options_json = '';
          continue;
        }

        // Parenthesize the given expression if needed
        function atomize(s) {
          if (s === ''
            || (/^\([^()]*?\)$/i.test(s))
            || (/^!?[a-z_][a-z0-9_]+(\([^()]+?\))?$/i.test(s))
            || (/^[a-z_][a-z0-9_]+ ([<>]=?|[!=]=) -?[a-z0-9_]+$/i.test(s))
          ) return s;
          return `(${s})`;
        }

        // 1. Capture "atomic" things, replace with $1, $2, etc.
        const apatt = [ /!?[a-z_][a-z0-9_]*\([^()]*?\)/gi,   // function-like expression
                    //  /[a-z_][a-z0-9_]* ([<>]=?|[!=]=) -?[a-z0-9_]*/gi, // simple comparison
                        /\([^(]+ [^();]+\)/g,                // inner parenthesized thing containing whitespace
                        /!?[a-z_][a-z0-9_]*?/gi ];           // bare symbol name (e.g., HAS_...)

        // Return the given expression free of (most) extraneous parentheses
        function remove_extra_parens(inExpr) {
          // Skip simple expressions without opening parentheses
          if (!(inExpr[0] === '(' || inExpr.includes(' ')) || inExpr.includes(') 0)'))
            return inExpr;

          const matches = [];
          let pcount = 0;
          let outExpr = inExpr
            .replace(apatt[0], (m) => { matches.push(m); return `;${pcount++};`; })
            .replace(apatt[1], (m) => { matches.push(m); return `;${pcount++};`; })
            .replace(apatt[2], (m) => { matches.push(m); return `;${pcount++};`; });

          // 2. Remove extra parentheses for "($<num>)" and "((whatever))"
          for (;;) {
            let oldExpr = outExpr;
            outExpr = outExpr.replace(/\(\s*(!?;\d+;|!?\([^()]*?\))\s*\)/g, '$1');
            if (outExpr === oldExpr) break;
          }

          // 3. Restore the original function calls by replacing ;#; with the original strings
          //    Must do this in reverse order because ;#; may be captured later
          while (--pcount >= 0)
            outExpr = outExpr.replace(new RegExp(`;${pcount};`, 'g'), matches[pcount]);

          return outExpr;
        }

        // Combine adjacent conditions where possible
        function _combine_conditions(cond) {
          return cond
            .replaceAll('!ENABLED', 'DISABLED').replaceAll('!DISABLED', 'ENABLED').replaceAll('!ANY', 'NONE').replaceAll('!NONE', 'ANY')
            .replace(/(?:DISABLED|!ALL|!BOTH)\s*\(\s*([^()]+?)\s*\)\s*\|\|\s*(?:DISABLED|!ALL|!BOTH)\s*\(\s*/g, '!ALL($1, ')
            .replace(/(?:ENABLED|ALL|BOTH)\s*\(\s*([A-Za-z_][A-Za-z0-9_]+)\s*\)\s*&&\s*(?:ENABLED|ALL|BOTH)\s*\(\s*/g, 'ALL($1, ')
            .replace(/(?:ENABLED|ANY|EITHER)\s*\(\s*([A-Za-z_][A-Za-z0-9_]+)\s*\)\s*\|\|\s*(?:ENABLED|ANY|EITHER)\s*\(\s*/g, 'ANY($1, ')
            .replace(/(?:NONE|DISABLED)\s*\(\s*([^()]+?)\s*\)\s*&&\s*(?:NONE|DISABLED)\s*\(\s*/g, 'NONE($1, ');
        }

        function combine_conditions(condarr) {
          //let cond = '(' + condarr.flat().join(') && (') + ')';
          let cond = condarr.flat().join(' && ');
          if (condarr.length > 1) {
            for (;;) {
              let old_cond = cond;
              cond = _combine_conditions(cond);
              if (old_cond === cond) break;
            }
          }
          return cond;
        }

        function combine_conditions_more(condarr) {
          //let cond = '(' + condarr.flat().join(') && (') + ')';
          let cond = condarr.flat().join(' && ');
          if (condarr.length > 1) {
            for (;;) {
              let old_cond = cond;
              cond = _combine_conditions(remove_extra_parens(_combine_conditions(cond)));
              if (old_cond === cond) break;
            }
          }
          return cond;
        }

        //
        // The conditions stack is an array containing condition-arrays.
        // Each condition-array lists the conditions for the current block.
        // IF/N/DEF adds a new condition-array to the stack.
        // ELSE/ELIF/ENDIF pop the condition-array.
        // ELSE/ELIF negate the last item in the popped condition-array.
        // ELIF adds a new condition to the end of the array.
        // ELSE/ELIF re-push the condition-array.
        //
        const drctv = line.split(/\s+/)[0],
              iselif = drctv === '#elif',
              iselse = drctv === '#else';

        if (iselif || iselse || drctv === '#endif') {
          if (conditions.length === 0) {
            //raise Exception(f'no #if block at line {line_number}')
            // TODO: Revert the view back to plain text editing
          }

          log("Handling else/end line", line_number);

          // Pop the last condition-array from the stack
          const prev = conditions.pop();

          // For else/elif, negate the last condition in the popped array
          if (iselif || iselse) {
            prev[prev.length - 1] = '!' + prev[prev.length - 1]; // Invert the last condition
            if (iselif) prev.push(atomize(line.slice(5).trim()));
            conditions.push(prev);
          }
          else
            if_depth--;
        }
        else if (drctv === '#if') {
          conditions.push([atomize(line.slice(3).trim())]);
          if_depth++;
          log(`Level ${if_depth} #if`, line_number);
        }
        else if (drctv === '#ifdef') {
          conditions.push([`defined(${line.slice(6).trim()})`]);
          if_depth++;
          log(`Level ${if_depth} #ifdef`, line_number);
        }
        else if (drctv === '#ifndef') {
          conditions.push([`!defined(${line.slice(7).trim()})`]);
          if_depth++;
          log(`Level ${if_depth} #ifndef`, line_number);
        }
        else if (defmatch) {
          // Handle a complete #define line

          const define_name = defmatch[3];

          // Certain defines are always left out of the schema
          if (ignore.includes(define_name)) continue;

          // Increment the serial ID
          sid++;

          // "enabled" indicated it's not commented out
          const enabled = !defmatch[1];

          // Disabled conditionals can be left out entirely.
          // All others are retained since conditions can change.
          if (!enabled && section === '_') continue;

          log(`Got #define ${define_name}`, line_number);

          let val = defmatch[4];

          // Type is based on the value
          let value_type, options;
          if (val === '') {
            value_type = 'switch';
          }
          else if (/^[A-Z0-9_]+_PIN$/.test(define_name)) {
            value_type = 'pin';
          }
          else if (/^(true|false)$/i.test(val)) {
            value_type = 'bool';
            val = val === 'true';
          }
          else if (/^.+_ENABLE_ON$/.test(define_name)) {
            value_type = 'state';
            val = [1,'1','true','HIGH'].includes(val) ? 'HIGH' : 'LOW';
          }
          else if (/^.+_HOME_DIR$/.test(define_name)) {
            value_type = 'dir';
            options = "{'-1':'Near', '0':'No Homing', '1':'Far'}";
          }
          else if (/^[\-+]?\s*\d+$/.test(val)) {
            value_type = 'int';
            val = val * 1;
          }
          else if (/^[\-+]?\s*(\d+\.|\d*\.\d+)([eE][\-+]?\d+)?[fF]?$/.test(val)) {
            value_type = 'float'
            val = val.replace('f', '') * 1;
          }
          else if (/^([A-Za-z_][A-Za-z0-9_]+)\s*(\([^()]*?\))$/.test(val)) {
            value_type = 'macro';
          }
          else {
            value_type = (
                val[0] === '"' ? 'string'
              : val[0] === "'" ? 'char'
              : /^(LOW|HIGH)$/i.test(val) ? 'state'
              : /^[A-Z0-9_]{2,}$/i.test(val) ? 'enum'
              : /^\{\s*(0x[A-F0-9]{2}\s*,?\s*){6}\}$/i.test(val) ? 'mac'
              : /^\{(\s*[\-+]?\s*\d+\s*(,\s*)?)+\}$/.test(val) ? 'int[]'
              : /^\{(\s*[\-+]?\s*(\d+\.|\d*\.\d+)([eE][\-+]?\d+)?[fF]?\s*(,\s*)?)+\}$/.test(val) ? 'float[]'
              : val[0] === '{' ? 'array'
              : ''
            );
          }

          // Create a new dictionary for the current #define
          var define_info = {
            sid, section, enabled,
            'name': define_name,
            'line': line_start,
            'orig': { enabled },
          };

          if (line_end !== line_start) define_info.line_end = line_end;
          if (val !== '') define_info.value = define_info.orig.value = val;
          if (value_type !== '') define_info.type = value_type;
          if (options) define_info.options = options;

          if (conditions.length) {
            define_info.requires = combine_conditions_more(conditions);
            define_info.depth = if_depth;
          }

          // Does the item belong to a "radio button" group?
          const group = this.itemGroup(define_info);
          if (group) define_info.group = group;

          // Items that depend on TEMP_SENSOR_* to be enabled.
          function is_heater_item(name) {
            const m1 = name.match(/^HOTEND(\d)_.+$/)
                    || name.match(/^HEATER_(\d)_M(AX|IN)TEMP$/)
                    || name.match(/^MAX_(BED|CHAMBER)_POWER$/)
                    || name.match(/^(EXTRUDER|HOTEND|BED|CHAMBER|COOLER|PROBE)_(AUTO_FAN_(TEMPERATURE|SPEED)|BETA|_LIMIT_SWITCHING|M(AX|IN)TEMP|OVERSHOOT|PULLUP_RESISTOR_OHMS|RESISTANCE_25C_OHMS|SH_C_COEFF)$/)
                    || name.match(/^(?:PREHEAT_\d_TEMP_|THERMAL_PROTECTION_|PIDTEMP)(EXTRUDER|HOTENDS?|BED|CHAMBER|COOLER|PROBE)$/)
                    || name.match(/^AUTO_POWER_(CHAMBER|COOLER|E)_(TEMP|FANS?)$/);
            if (m1) return ['EXTRUDER', 'HOTEND', 'HOTENDS', 'E'].includes(m1[1]) ? '0' : m1[1];
          }

          // Items that depend on some TEMP_SENSOR_* to have a specific value.
          function is_sensor_item(name) {
            const m1 = name.match(/^DUMMY_THERMISTOR_(\d+)_VALUE$/);
            if (m1) return m1[1];
          }

          // Items that depend on some TEMP_SENSOR_* to be a thermocouple.
          function is_thermocouple_item(name) {
            const m1 = name == "THERMOCOUPLE_MAX_ERRORS";
            if (m1) return true;
          }

          // Items that depend on EXTRUDERS to be enabled.
          function is_eaxis_item(name) {
            const m1 = name.match(/^E(\d)_(DRIVER_TYPE|AUTO_FAN_PIN|FAN_TACHO_PIN|FAN_TACHO_PULL(UP|DOWN)|MAX_CURRENT|SENSE_RESISTOR|MICROSTEPS|CURRENT|RSENSE|CHAIN_POS|INTERPOLATE|HOLD_MULTIPLIER|CS_PIN|SLAVE_ADDRESS|HYBRID_THRESHOLD)$/)
                    || name.match(/^CHOPPER_TIMING_E(\d)$/)
                    || name.match(/^INVERT_E(\d)_DIR$/)
                    || name.match(/^HEATER_(\d)_M(AX|IN)TEMP$/)
                    || name.match(/^TEMP_SENSOR_(\d)$/)
                    || name.match(/^FIL_RUNOUT(\d)_(STATE|PULL(UP|DOWN))$/);
            if (m1) return m1[1];
            if (['DISABLE_IDLE_E', 'STEP_STATE_E', 'NOZZLE_PARK_FEATURE', 'NOZZLE_CLEAN_FEATURE'].includes(name)) return '0';
          }

          // Items that depend on *_DRIVER_TYPE to be enabled.
          function is_axis_item(name) {
            const m1 = name.match(/^([XYZIJKUVW]\d?)_(CHAIN_POS|CS_PIN|CURRENT(_HOME)?|ENABLE_ON|HOLD_MULTIPLIER|HOME_DIR|HYBRID_THRESHOLD|INTERPOLATE|MAX_CURRENT|M(AX|IN)_ENDSTOP_(INVERTING|HIT_STATE)|M(AX|IN)_POS|MICROSTEPS|RSENSE|SAFETY_STOP|SENSE_RESISTOR|SLAVE_ADDRESS|STALL_SENSITIVITY)$/)
                    || name.match(/^(?:CHOPPER_TIMING|DISABLE(?:_INACTIVE|_IDLE)?|M(?:AX|IN)_SOFTWARE_ENDSTOP|SAFE_BED_LEVELING_START|STEALTHCHOP|STEP_STATE)_([XYZIJKUVW]\d?)$/)
                    || name.match(/^INVERT_(.+)_(DIR|STEP_PIN)$/)
                    || name.match(/^MANUAL_(.+)_HOME_POS$/)
                    || name.match(/^CALIBRATION_MEASURE_(.+)M(AX|IN)$/)
                    || name.match(/^USE_(.+)M(AX|IN)_PLUG$/)
                    || name.match(/^ENDSTOPPULL(?:UP|DOWN)_(.+)M(AX|IN)$/);
            if (m1) return m1[1];
            const m2 = name.match(/^AXIS(\d)_(NAME|ROTATES)$/);
            if (m2) return ['I', 'J', 'K', 'U', 'V', 'W'][m2[1] - 4];
          }

          function is_serial_item(name) {
            const m1 = name.match(/^BAUDRATE(_(\d))?$/);
            if (m1) return m1[2] || '0';
            if (name === 'BAUD_RATE_GCODE') return '0';
            const m2 = name.match(/^SERIAL_PORT_(\d)$/);
            if (m2) return m2[1] === '2' ? '0' : (m2[1] - 1).toString();
          }

          // Some items depend on axes being enabled
          const axis = is_axis_item(define_name),
              eindex = is_eaxis_item(define_name),
              hindex = is_heater_item(define_name),
              tindex = is_sensor_item(define_name),
              sindex = is_serial_item(define_name);

          function extend_requires(cond) {
            if ('requires' in define_info)
              define_info.requires = `${cond} && ${atomize(define_info.requires)}`;
            else
              define_info.requires = cond;
          }
          if (axis) {
            extend_requires(`HAS_AXIS(${axis})`);
            define_info.requires = define_info.requires.replace(`&& defined(${axis}_DRIVER_TYPE)`, '');
          }
          if (eindex) extend_requires(`HAS_EAXIS(${eindex})`);
          if (hindex) extend_requires(`HAS_SENSOR(${hindex})`);
          if (tindex) extend_requires(`ANY_THERMISTOR_IS(${tindex})`);
          if (sindex) extend_requires(`HAS_SERIAL(${sindex})`);
          if (is_thermocouple_item(define_name)) extend_requires(`HAS_MAX_TC()`);

          // If the comment specifies units, add that to the info
          function set_units(comm) {
            let units = comm.match(/^\(([^)]+)\)/);
            if (units) {
              units = units[1];
              if (['s', 'sec'].includes(units)) units = 'seconds';
              define_info.units = units;
            }
          }

          // If the comment_buff is not empty, add the comment to the info
          let full_comment = '';
          if (prev_comment !== '') {
            full_comment = prev_comment;
            prev_comment = '';
          }
          else if (comment_buff && state !== Parse.EOL_COMMENT) {
            full_comment = comment_buff.join('\n');
            comment_buff = [];
          }
          define_info.comment = full_comment;
          set_units(full_comment); // If the comment specifies units, add that to the info

          // Set the options for the current #define
          if (define_name === "MOTHERBOARD" && boards?.length) {
            define_info.options = boards;
          }
          else if (options_json !== '') { // Options, thermistors, boards, etc.
            const optstr = ConfigSchema.cleanOptions(options_json);
            let opts;
            try {
              eval(`opts = ${optstr}`);
            }
            catch (e) {
              console.error(`Error evaluating: ${optstr}`);
              opts = [];
            }

            let isopt = false;
            if ('includes' in opts)
              isopt = opts.includes(val);   // Array, probably
            else
              isopt = val in opts;          // Dictionary, probably

            if (isopt)
              define_info.options = options_json; // Ok to use options
            else
              oneshot_opt = true;           // Done with any previous options

            if (oneshot_opt) {
              oneshot_opt = false;
              options_json = '';
            }
          }

          // Create section dict if it doesn't exist yet
          if (!(section in sdict)) sdict[section] = {};

          // The previously defined item or array
          const info = sdict[section][define_name];

          // If define has already been seen it becomes an array.
          // Done non-destructively to preserve old references.
          if (info) {
            // Ensure the existing value is an array and log a duplicate entry
            if (Array.isArray(info))
              info.push(define_info);
            else
              sdict[section][define_name] = [ info, define_info ];
            log(`Duplicate #define ${define_name} (${sid})`, line_number);
          }
          else {
            // Add the define dict with name as key
            sdict[section][define_name] = define_info;
            log(`Added #define ${define_name} (${sid}) to section '${section}'`, line_number);
          }

          // Keep an index by SID
          this.bysid[sid] = define_info;

          // Sequential items with the same name go into a group together
          if (sid > 1 && sid - 1 in this.bysid) {
            const prev = this.bysid[sid - 1];
            if (define_name === prev.name && define_info.group === undefined)
              define_info.group = prev.group = define_name.toLowerCase();
          }

          if (state === Parse.EOL_COMMENT) last_added_ref = define_info;
        }
        else {
          // For an #undef mark all previous instances of the name disabled and
          // add an 'undef' field containing the sid it was undefined after.
          // If it was already undefined earlier, don't override that sid.
          const unmatch = line.match(/^\s*#undef\s+([^\s]+)/);
          if (unmatch) {
            const name = unmatch[1];
            let isactive = true;
            if (conditions.length) {
              let define_info = {
                name, sid,
                'enabled': true,
                'line': line_start,
                'requires': combine_conditions_more(conditions)
              };
              this.evaluateRequires(define_info);
              isactive = define_info.evaled;
            }
            if (isactive) {
              for (const item of this.iterateItemsWithName(name))
                item.undef ??= sid;
            }
          }
        }
      } // end NORMAL
    } // loop lines

    // Clear out empty sections added to ensure the section order.
    this.removeUnusedSections();

    // Evaluate the enabled state of all items, filling in all 'eval' fields.
    this.refreshAllRequires();
  }

}; // end class ConfigSchema

/**
 * combinedSchema - aka "multiSchema" - organizes the content of all config files.
 * Upon loading the extension, read and parse the first config, then conditionals,
 * then the second config. The result is stored in the file scope 'schemas' object
 * with keys 'basic' and 'advanced'.
 * The 'advanced' schema depends on the basic config and conditionals, so these
 * are included as a preface, both stripped down to save on serialization.
 */
function combinedSchema(marlin, fs, reload=false) {
  if ('combined' in ConfigSchema && !reload) return ConfigSchema.combined;

  const con1 = marlin.pathFromArray(['Configuration.h']),
        con2 = marlin.pathFromArray(['Configuration_adv.h']);

  // Read configs into strings
  const config1 = fs.readFileSync(con1, 'utf8'),
        config2 = fs.readFileSync(con2, 'utf8');

  // Read conditionals into a string
  var configd;
  const cond = marlin.pathFromArray(['src', 'inc', 'Conditionals_LCD.h']);
  if (fs.existsSync(cond)) {
    configd = fs.readFileSync(cond, 'utf8');
  }
  else {
    const cond1 = marlin.pathFromArray(['src', 'inc', 'Conditionals-1-axes.h']),
          cond2 = marlin.pathFromArray(['src', 'inc', 'Conditionals-2-LCD.h']),
          cond3 = marlin.pathFromArray(['src', 'inc', 'Conditionals-3-etc.h']);
    configd = fs.readFileSync(cond1, 'utf8') + fs.readFileSync(cond2, 'utf8') + fs.readFileSync(cond3, 'utf8');
  }

  // Strip down Configuration.h and Conditionals*.h files to just the
  // preprocessor directives for faster parsing below.
  const sch1 = ConfigSchema.strippedConfig(config1),
        sch2 = ConfigSchema.strippedConfig(configd);

  // Combine configs into one schema to use when editing the second config.
  const adv_combo = '// @section __\n' + sch1.text + '// @section _\n' + sch2.text + '// @section none\n' + config2;

  // The number of lines to subtract in the second schema.
  const prefix_lines = sch1.lines + sch2.lines + 3;

  /**
   * Create two schemas for use in editor interaction, since we need to know if a change
   * was made in Configuration.h that affects Configuration_adv.h directly or indirectly.
   * bas : Configuration.h schema
   * adv : Configuration_adv.h schema with Configuration.h + Conditionals_LCD.h precursor
   */
  const bas = ConfigSchema.newSchemaFromText(config1),
        adv = ConfigSchema.newSchemaFromText(adv_combo, -prefix_lines);

  ConfigSchema.combined = { basic: bas, advanced: adv };
  return ConfigSchema.combined;
}

//ConfigSchema.verbose = true;
try {
  // Exports when loading this as a module
  module.exports = { ConfigSchema, combinedSchema };
  log('ConfigSchema loaded as a module');
}
catch (e) {
  // The class is in the global scope
  log('ConfigSchema loaded as a global');
}
