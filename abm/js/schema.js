/**
 * Auto Build Marlin
 * abm/js/schema.js
 *
 * The schema imports a configuration as a dictionary so it can be
 * used for the Custom Editor form or export to JSON, YML, and YML
 * tailored to Jekyll.
 *
 * Loaded by the custom editor (see editor.js : getWebViewHtml) so
 * editview.js is able to have access to the schema.
 *
 * Also loaded by editor.js so it can parse the complete configuration
 * and provide the model to the custom editor in place of the document
 * text, when needed.
 */
'use strict';

function log(message, line = 0) {
  if (ConfigSchema.verbose) console.log(line ? `[${line}] ${message}` : message);
}

/**
 * ConfigSchema encapsulates a single configuration file schema, imported
 * from C/C++ header files with #define directives and custom macros.
 *
 * - The schema is stored in a 'data' dictionary keyed by option name.
 * - The first import pass:
 *   - Gathers an exhaustive list of all #define items, both enabled and disabled.
 *   - Captures the nested #if structure indirectly:
 *     - Each item has a 'requires' field with the block conditions translated into Javascript.
 *     - The 'requires' Javascript can only run inside of evaluateRequires.
 *   - The 'evaled' result on an item is set by calling evaluateRequires(item).
 *   - Deleting the 'evaled' field and calling evaluateRequires(item) forces re-evaluation.
 *     Since every item afterward needs re-evaluation, call updateEditedItem(item).
 *
 * - Each item in the schema is a dictionary with information about a single #define.
 *   See the description at importText() below for the #define info structure.
 * - The schema 'bysid' contains every #define in order of import / appearance.
 *   (If the sid was guaranteed to be contiguous 'bysid' could be an array.)
 */
class ConfigSchema {
  static verbose = false;

  // Populate a new schema from text, numbering lines starting from an index.
  constructor(text, numstart=0) {
    this.data = {};
    this.bysid = {};
    if (text) this.importText(text, numstart);
  }
  // Factory method to create a new uninitialized schema.
  static newSchema() {
    return new ConfigSchema();
  }
  // Factory method to create a schema from a text string.
  static fromText(text, numstart=0) {
    return new ConfigSchema(text, numstart);
  }
  // Factory method to create a schema from a data reference.
  static fromData(data) {
    const instance = new ConfigSchema();
    instance.data = data;
    return instance;
  }

  // Clean up options so they can be JSON parsed.
  static cleanOptions(opts) {
    if (opts.match(/\[\s*\d\s*:\s*[\'"]/))
      opts = opts.replace('[', '{').replace(']', '}');
    return opts;
  }

  debug() { console.dir(this.data); }
  debug_sections() { console.log(Object.keys(this.data)); }

  /**
   * Reduce the given config text down to just preprocessor
   * directive lines, removing all block comments.
   * This makes the text quicker to parse, but don't apply
   * if you need to preserve comments and line numbers.
   */
  static strippedConfig(config) {
    var text = '', count = 0, addnext = false;
    const lines = config.replace(/\/\*.+?\*\//).split('\n'); // Strip block comments, split into lines
    for (const line of lines) {
      if (addnext)                              // Previous line ended with '\'
        text += ' ';
      else if (!line.match(/^\s*(\/\/)?\s*#/))  // Only keep lines starting with '#' or '//#'
        continue;
      addnext = (/\\$/.test(line));             // New line ends with '\'?
      text += line.replace(/ *\\$/, '');        // Add the line to the text, minus any '\'
      if (!addnext) {
        text += '\n';                           // Terminate if it didn't end with '\'
        count++;                                // Count up the number of lines
      }
    }
    return { text:text, lines:count };
  }

  /**
   * Pre-created schema dict with an array of section keys.
   * This is the order sections will appear on all config editor forms.
   * Keep adjusting to place the most relevant sections first.
   */
  static emptyOrderedSchema() {
    const sections = [
      "_",
      "test",
      "custom",

      "info",
      "machine",
      "eeprom",

      "stepper drivers",
      "multi stepper",
      "idex",
      "extruder",

      "geometry",
      "homing",
      "?kinematics",
      "motion",
      "motion control",

      "endstops",
      "?probe type",
      "probes",
      "bltouch",
      "leveling",

      "temperature",
      "mpctemp",
      "bed temp",
      "fans",

      "tool change",
      "advanced pause",
      "calibrate",

      "hotend temp",
      "chamber temp",
      "cnc",

      "?lcd",
      "interface",
      "custom main menu",
      "custom config menu",
      "custom buttons",

      "develop",
      "debug matrix",

      "delta",
      "scara",
      "tpara",
      "polar",

      "filament width",
      "gcode",

      "host",

      "i2c encoders",
      "i2cbus",
      "joystick",
      "lights",
      "multi-material",
      "nanodlp",
      "network",
      "photo",
      "power",
      "psu control",
      "reporting",
      "safety",
      "security",
      "serial",
      "servos",
      "stats",

      "tmc/config",
      "tmc/hybrid",
      "tmc/serial",
      "tmc/smart",
      "tmc/spi",
      "tmc/stallguard",
      "tmc/status",
      "tmc/stealthchop",
      "tmc/tmc26x",

      "units",
      "volumetrics",

      "extras"
    ];

    // Create a dictionary of empty sections in the order above.
    var dict = {};
    for (const s of sections) dict[s] = {};
    return dict;
  }

  /**
   * Return an emoji to dress up the given section.
   *
   *  👁 🤞 👤 👮‍♀️ 🥷 🎅 😱 😷 💩 👽 ☠️ 👾 🤖 🫵 👥 🧠 🗣 👩‍💻 🧜‍♀️ 🤷
   *  🦺 👔 👑 👓 🧢 🕶 🥽 💼 🎩 🧤 🦄 🐝 🐛 🐌 🐢 🐙 📁 💾 📺 ⏰
   *  ⏱ 🧭 📷 🪣 ⏰ 🔋 ⚓️ 🚦 🚑 🚗 🚀 💡 🔌 🔧 🔨 🧰 ⚒ 🛠 ⚙️ 🔑 💊
   *  💣 📦 📖 ✏️ 📝 ❤️ 🆘 ❌ ✅ 🚸 ⚠️ ❓ ❗️ ▶️ ⏸ ⏹ 🎵 🕓 🇺🇦🇬🇧🇺🇸🇨🇦
   *  🗑 🏛 ✈️ 🛸 🚜 🧩 🎲 🎮 🎱 🍿 🍔 🍊 🍅 ☂️ ☘️ 🍀 🦤 🪲 🕷 🤓 ☝️
   *
   */
  static section_emoji(s) {
    const emojis = {
      "advanced pause": "⏯",
      "bed temp": "🌡",
      "bltouch": "☝️",
      "calibrate": "🔍",
      "caselight": "💡",
      "chamber temp": "🌡",
      "cnc": "🪚",
      "custom": "❓",
      "custom buttons": "🔘",
      "custom config menu": "🔧",
      "custom main menu": "🔧",
      "debug matrix": "🪲",
      "delta": "∆",
      "develop": "🛠",
      "eeprom": "💾",
      "endstops": "🛑",
      "extras": "🔍",
      "extruder": "💩",
      "fans": "💨",
      "filament width": "📏",
      "gcode": "🎱",
      "geometry": "📐",
      "homing": "🏠",
      "host": "🐙",
      "hotend temp": "🌡",
      "i2c encoders": "👀",
      "i2cbus": "🧪",
      "info": "ℹ︎",
      "interface": "⌨️",
      "joystick": "🕹",
      "lcd": "🖥",
      "leveling": "🧩",
      "lights": "💡",
      "machine": "🤖",
      "motion": "🏃",
      "motion control": "🏃",
      "mpctemp": "🌡",
      "multi-material": "🍔",
      "multi stepper": "🛞",
      "nanodlp": "🦤",
      "network": "🕸",
      "photo": "📷",
      "polar": "🐧",
      "power": "⚡️",
      "probes": "🛰",
      "probing": "🛰",
      "probe type": "🛰",
      "psu control": "🔌",
      "reporting": "📢",
      "safety": "🦺",
      "scara": "🦄",
      "security": "🔒",
      "serial": "🥣",
      "servos": "🦾",
      "stats": "📊",
      "stepper drivers": "🛞",
      "temperature": "🌡",
      "test": "🧪",
      "tmc/config": "😎",
      "tmc/hybrid": "😎",
      "tmc/serial": "😎",
      "tmc/smart": "😎",
      "tmc/spi": "😎",
      "tmc/stallguard": "😎",
      "tmc/status": "😎",
      "tmc/stealthchop": "😎",
      "tmc/tmc26x": "😎",
      "tool change": "🔧",
      "tpara": "🦄",
      "units": "🇺🇳",
      "volumetrics": "🎚"
    };
    return emojis[s] ? emojis[s] : "🍅";
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
  definedBefore(item, before) {
    if (!before) return true;
    if (item.sid >= before) return false;
    if (item.enabled !== undefined && !item.enabled) return false;
    if (item.evaled !== undefined && !item.evaled) return false;
    if (item.undef !== undefined && item.undef < before) return false;
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
  getItemsInSection(sect, fn, before, limit) {
    log(`getItemsInSection(${sect}, ..., ${before}, ${limit})`);
    var results = [];
    for (const [name, foo] of Object.entries(this.data[sect])) {
      if (foo instanceof Array) {
        for (const item of foo) {
          if (this.definedBefore(item, before) && fn(item)) {
            results.push(item);
            if (limit && results.length >= limit) return results;
          }
        }
      }
      else if (this.definedBefore(foo, before) && fn(foo)) {
        results.push(foo);
        if (limit && results.length >= limit) return results;
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
  getItems(fn, before, limit) {
    var results = [];
    for (const sect in this.data) {
      results.concat(this.getItemsInSection(sect, fn, before, limit));
      limit -= results.length;
      if (limit <= 0) break;
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
  firstItemWithName(name, before=99999) {
    log(`firstItemWithName(${name}, ${before})`);
    for (const [sect, opts] of Object.entries(this.data)) {
      if (name in opts) {
        const foo = opts[name];
        if (foo instanceof Array) {
          for (const item of foo) if (this.definedBefore(item, before)) return item;
        }
        else if (this.definedBefore(foo, before)) return foo;
      }
    }
    return null;
  }

  /**
   * Find the last defined (and not since undefined) item in the schema with a given name before an optional sid.
   *
   * @param {string} name Name of the item to find.
   * @param {int} before The last index allowed for the item.
   * @return The item found, or null.
   */
  lastItemWithName(name, before=99999) {
    log(`lastItemWithName(${name}, ${before})`);
    var outitem = null;
    for (const [sect, opts] of Object.entries(this.data)) {
      if (name in opts) {
        const foo = opts[name];
        if (foo instanceof Array) {
          for (const item of foo) if (this.definedBefore(item, before)) outitem = item;
        }
        else if (this.definedBefore(foo, before)) outitem = foo;
      }
    }
    return outitem;
  }

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
    // LCD Names
    const lcd_names = [
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
    ];
    if (lcd_names.includes(item.name)) {
      if (item.depth === undefined || item.depth == 0) return 'lcd';
      return null;
    }

    // U8GLIB
    const u8glib = [ 'U8GLIB_SSD1306', 'U8GLIB_SH1106' ];
    if (u8glib.includes(item.name)) return 'u8glib';

    // TFT Interfaces
    const tft_if = [ 'TFT_INTERFACE_FSMC', 'TFT_INTERFACE_SPI' ];
    if (tft_if.includes(item.name)) return 'tft-if';

    // TFT Resolutions
    const tft_res = [ 'TFT_RES_320x240', 'TFT_RES_480x272', 'TFT_RES_480x320', 'TFT_RES_1024x600' ];
    if (tft_res.includes(item.name)) return 'tft-res';

    // RGB or RGBW
    const rgbled = [ 'RGB_LED', 'RGBW_LED' ];
    if (rgbled.includes(item.name)) return 'rgbled';

    // Hotend temperature control methods
    const temp_control = [ 'PIDTEMP', 'MPCTEMP' ];
    if (temp_control.includes(item.name)) return 'temp-control';

    // Probe types
    const probes = [
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
    ];
    if (probes.includes(item.name)) return 'probe';

    // Leveling methods
    const leveling = [
      'AUTO_BED_LEVELING_3POINT',
      'AUTO_BED_LEVELING_LINEAR',
      'AUTO_BED_LEVELING_BILINEAR',
      'AUTO_BED_LEVELING_UBL',
      'MESH_BED_LEVELING',
    ];
    if (leveling.includes(item.name)) return 'leveling';

    // Kinematics / Machine Types
    const kinematics = [
      'DELTA',
      'MORGAN_SCARA', 'MP_SCARA', 'AXEL_TPARA',
      'COREXY', 'COREXZ', 'COREYZ', 'COREYX', 'COREZX', 'COREZY',
      'MARKFORGED_XY', 'MARKFORGED_YX',
      'ARTICULATED_ROBOT_ARM', 'FOAMCUTTER_XYUV', 'POLAR'
    ];
    if (kinematics.includes(item.name)) return 'kinematics';

    // Axis Homing Submenus
    const lcd_homing = [ 'INDIVIDUAL_AXIS_HOMING_MENU', 'INDIVIDUAL_AXIS_HOMING_SUBMENU' ];
    if (lcd_homing.includes(item.name)) return 'lcd-homing';

    // Digital Potentiometers
    const digipot = [ 'DIGIPOT_MCP4018', 'DIGIPOT_MCP4451' ];
    if (digipot.includes(item.name)) return 'digipot';

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

    // A cond string is a list of conditions using Marlin macros
    // that we can convert into JavaScript and eval. Later we can
    // try to interpret, but for now it's much easier to let eval
    // do all the hard work.

    // If already evaluated, return the last result.
    // To refresh the result, delete the 'evaled' key.
    if (initem.evaled !== undefined) return initem.evaled;

    // If no conditions, return true.
    if (initem.requires === undefined) return true;

    // Conditions are general C++ preprocessor macros.
    var cond = initem.requires;

    const istrue = ['', '1', 'true'],
         isfalse = ['0', 'false'];

    // No evaluation required for simple conditions.
    if (istrue.includes(cond)) return true;
    if (isfalse.includes(cond)) return false;

    //log("evaluateRequires"); if (verbose) console.dir(initem);

    const self = this, sdict = this.data;

    // Last item, by name, before the evaluated item.
    function priorItemNamed(name, before=initem.sid) { return self.lastItemWithName(name, before); }

    // Is a single item defined before the current line?
    function _defined(item) {
      //log(`_defined(${item.name})`)
      if (!item.enabled) return false;
      if (item.sid >= initem.sid) return false;
      if (item.undef !== undefined ) return false;
      return self.evaluateRequires(item);
    }

    // Is a single item enabled? (defined and has no value, 1, or true)
    function _enabled(item) {
      //log(`_enabled(${item.name})`)
      if (!_defined(item)) return false;
      if (item.value === undefined) return true;
      return istrue.includes(item.value);
    }

    // Does the given define exist and is it enabled?
    function defined(foo) {
      //if (foo === true) return true;
      if (foo instanceof Array) {
        //log(`defined(array)`)
        const len = foo.length;
        for (const f of foo) if (!defined(f)) return false;
        return true;
      }
      //log(`defined({foo})`)
      for (const [sect, opts] of Object.entries(sdict)) {
        if (foo in opts) {
          const baz = sdict[sect][foo];
          if (baz instanceof Array) {
            for (const item of baz) if (_defined(item)) return true;
          }
          else if (_defined(baz)) return true;
        }
      }
      return false;
    }

    // Are the given items all enabled or all disabled?
    function _enatest(foo, state) {
      //log(`_enatest(${foo}, ${state})`);
      // For an array, loop and call _enatest on each item
      if (foo instanceof Array) {
        //log('...an array of names');
        const len = foo.length;
        for (var i = 0; i < len; i++)
          if (!_enatest(foo[i], state)) return false;
        return true;
      }
      //log('...a single name');
      for (const [sect, opts] of Object.entries(sdict)) {
        if (foo in opts) {
          const baz = sdict[sect][foo];
          //log(`Found ${foo}`); console.dir(baz);
          if (baz instanceof Array) {
            //log(`...an array of items`); console.dir(baz);
            for (const item of baz)
              if (item.sid < initem.sid && _enabled(item) != state) return false;
          }
          else return _enabled(baz) == state;
        }
      }
      return true;
    }

    // Are all given items enabled / disabled?
    const ENABLED = foo => _enatest(foo, true),
         DISABLED = foo => _enatest(foo, false);

    // Are any of the given items enabled?
    function ANY(foo) {
      if (!(foo instanceof Array)) return ENABLED(foo) // should always be an array
      const len = foo.length;
      for (var i = 0; i < len; i++)
        if (ENABLED(foo[i])) return true;
      return false;
    }
    const NONE = DISABLED, BOTH = ENABLED, ALL = ENABLED, EITHER = ANY;

    function COUNT_ENABLED(names) {
      var count = 0;
      for (const name of names) if (ENABLED(name)) count++;
      return count;
    }

    // Is MOTHERBOARD any one of the boards provided?
    function MB(foo) {
      const item = priorItemNamed('MOTHERBOARD');
      if (!item) return false;
      const mb = item.value.replace(/^BOARD_/, '');
      if (foo instanceof Array) return foo.includes(mb);
      return foo == mb;
    }

    ///// Conditions based on other criteria, e.g., item.name /////

    function _nonzero(name) {
      const item = priorItemNamed(name);
      //console.log(`_nonzero(${name})`, item);
      return item && item.value && (item.value !== 'false');
    }

    // [AXIS]_DRIVER_TYPE is enabled. For older config versions
    // we can check the value of NUM_AXES or LINEAR_AXES.
    function HAS_AXIS(axis) {
      const driver = priorItemNamed(`${axis}_DRIVER_TYPE`);
      return driver !== null;
    }

    // The item is enabled by its E < EXTRUDERS.
    function HAS_EAXIS(eindex) {
      const extruders = priorItemNamed('EXTRUDERS', 99999);
      if (extruders == null) return false;
      const stat = eindex < extruders.value;
      //console.log(`HAS_EAXIS(${eindex}) == ${stat ? 'true' : 'false'}`, extruders);
      return stat;
    }

    // The item is enabled by TEMP_SENSOR_[NAME] != 0.
    const HAS_SENSOR = name => _nonzero(`TEMP_SENSOR_${name}`);

    function HAS_SERIAL(sindex) {
      return priorItemNamed(sindex == '0' ? 'SERIAL_PORT' : `SERIAL_PORT_${sindex}`) !== null;
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
      return driver && (driver.value == type);
    }

    // The temp sensor for the given heater/cooler is a thermocouple.
    function TEMP_SENSOR_IS_MAX_TC(name) {
      const sensor = priorItemNamed(`TEMP_SENSOR_${name}`);
      return sensor && [-5, -3, -2].includes(sensor.value);
    }

    // Some enabled driver matches the given enum.
    function _has_driver(type) {
      return self.getItems(it => it.evaled && it.value == type, initem.sid).length > 0;
    }
    function HAS_DRIVER(type) {
      if (!(type instanceof Array)) return _has_driver(type);
      const len = type.length;
      for (var i = 0; i < len; i++) if (_has_driver(type[i])) return true;
      return false;
    }

    function AXIS_IS_TMC_CONFIG(axis) {
      const driver = priorItemNamed(`${axis}_DRIVER_TYPE`);
      return driver && ['TMC2130','TMC2160','TMC2208','TMC2209','TMC2660','TMC5130','TMC5160'].includes(driver.value);
    }

    // DGUS_UI_IS for DGUS_LCD_UI
    function _dgus_ui_is(dgus) {
      const lcd = priorItemNamed('DGUS_LCD_UI');
      return lcd && (lcd.value == dgus);
    }
    function DGUS_UI_IS(dgus) {
      if (!(dgus instanceof Array)) return _dgus_ui_is(dgus);
      const len = dgus.length;
      for (var i = 0; i < len; i++) if (_dgus_ui_is(dgus[i])) return true;
      return false;
    }

    // Loose names may be in the schema or be defined by Conditionals-2-LCD.h
    function OTHER(cond) {
      // See if the item is enabled in the schema and use its value.
      const found = self.getItems(it => it.name == cond && it.evaled && it.enabled, initem.sid, 1);
      if (found.length > 0) return found[0].value;

      // Do custom handling for items not found in the schema.
      switch (cond) {
        case 'HAS_E_TEMP_SENSOR':
          const extruders = priorItemNamed('EXTRUDERS');
          if (extruders && extruders.value > 0) {
            for (var i = 0; i < extruders.value; i++) {
              const sensor = priorItemNamed(`TEMP_SENSOR_${i}`);
              if (sensor && sensor.value) return true;
            }
          }
          return false;

        case 'XY': return 2;
        case 'XYZ': return 3;

        case 'HAS_TRINAMIC_CONFIG':
          return HAS_DRIVER(['TMC2130','TMC2160','TMC2208','TMC2209','TMC2660','TMC5130','TMC5160']);

        default:
          if (cond.startsWith('TEMP_SENSOR_'))
            return HAS_SENSOR(cond.slice(9));

          //console.warn(`OTHER Unknown: ${cond}`);
          return true;
      }
      return false;
    }

    const before_mangle = cond;

    //
    // Find MAP(...) macros and expand them
    // Example:
    //      #define CB(N) || (BLAH(N) && HAS_## N ##_AXIS)
    //      #if 0 MAP(CB, X, Y, Z)
    //   => #if 0 || (BLAH(X) && HAS_X_AXIS) || (BLAH(Y) && HAS_Y_AXIS) || (BLAH(Z) && HAS_Z_AXIS)
    //
    const mappatt = /(MAP\((([^)]+))\))/g;
    var res;
    while (res = mappatt.exec(cond)) {
      const maparr = res[2].split(/\s*,\s*/),
            fun = maparr.shift(),
            funcinfo = priorItemNamed(fun),
            funcpar = funcinfo.value.match(/^\(([^)]+)\)\s*(.*)/),
            funcarg = funcpar[1], functpl = funcpar[2],
            regp = new RegExp(`(##\\s*${funcarg}\\s*##|##\\s*${funcarg}\\b|\\b${funcarg}\\s*##)`, 'g');
      var newmap = '';
      for (let n of maparr) newmap += functpl.replace(regp, n);
      cond = cond.replace(res[0], newmap);
      //console.log("mapInfo", { maparr, fun, funcinfo, funcarg, functpl, newmap });
    }

    // Convert Marlin macros into JavaScript function calls:
    cond = cond
      .replace(/(AXIS_DRIVER_TYPE)_(\w+)\((.+?)\)/g, '$1($2,$3)')         // AXIS_DRIVER_TYPE_X(A4988)     => AXIS_DRIVER_TYPE(X,A4988)
      .replace(/\b([A-Z][A-Z0-9_]*)\b(\s*([^(,]|$))/g, 'OTHER($1)$2')     // LOOSE_SYMBOL                  => OTHER(LOOSE_SYMBOL)
      .replace(/([A-Z0-9_]\s*\(|,\s*)OTHER\(([^)]+)\)/g, '$1$2')          // ANYCALL(OTHER(LOOSE_SYMBOL)   => ANYCALL(LOOSE_SYMBOL
      .replace(/(\bdefined\b)\s*\(?\s*OTHER\s*\(\s*([^)]+)\s*\)\s*\)?/g, '$1($2)') // defined(OTHER(ABCD)) => defined(ABCD)
      .replace(/(\b[A-Z0-9_]+\b)([^(])/gi, '"$1"$2')                      // LOOSE_SYMBOL[^(]              => "LOOSE_SYMBOL"
      .replace(/(\b[A-Z][A-Z0-9_]+\b)\(([^)]+?,[^)]+)\)/g, '$1([$2])')    // Wrap simple macro args into an [array]
      ;

    try {
      initem.evaled = eval(cond);
    }
    catch (e) {
      console.error(`Error evaluating: ${cond}\n\n${before_mangle}`, e);
      initem.evaled = true;
    }

    //log(`${initem.name} -----${initem.evaled} == ${cond} ----------`);

    return initem.evaled;
  } // evaluateRequires

  // Evaluate the 'requires' field of every define to see if it
  // is ruled out by its presence in a conditional block.
  // Called at the end of importText to parse all 'requires'.
  refreshAllRequires() {
    const sdict = this.data;
    // Clear all the evaluation results first.
    for (const sect in sdict) {
      for (const [name, foo] of Object.entries(sdict[sect])) {
        if (foo instanceof Array)
          for (const item of foo) delete item.evaled;
        else
          delete foo.evaled;
      }
    }

    // Update the evaluation results for each item in sequence.
    for (const sect in sdict) {
      for (const [name, foo] of Object.entries(sdict[sect])) {
        if (foo instanceof Array)
          for (const item of foo) this.evaluateRequires(item);
        else
          this.evaluateRequires(foo);
      }
    }
  }

  // Refresh all requires that follow a changed item.
  refreshRequiresAfter(after) {
    const sdict = this.data;
    // Clear the specified evaluation results first.
    for (const sect in sdict) {
      for (const [name, foo] of Object.entries(sdict[sect])) {
        if (foo instanceof Array) {
          for (const item of foo) if (item.sid >= after) delete item.evaled;
        }
        else if (foo.sid >= after) delete foo.evaled;
      }
    }

    // Update the evaluation results for each item in sequence.
    for (const sect in sdict) {
      for (const [name, foo] of Object.entries(sdict[sect])) {
        if (foo instanceof Array) {
          for (const item of foo) if (item.sid >= after) this.evaluateRequires(item);
        }
        else if (foo.sid >= after) this.evaluateRequires(foo);
      }
    }
  }

  // Remove all empty sections from the schema.
  // This followup step is needed as part of imposing our key order.
  removeUnusedSections() {
    const sdict = this.data;
    for (const sect of Object.keys(sdict))
      if (Object.keys(sdict[sect]).length === 0) delete sdict[sect];
  }

  // Update an item's enabled / value from an (edited) item.
  // Re-run 'requires' on all items that follow to update 'evaled'.
  updateEditedItem(initem) {
    Object.assign(this.bysid[initem.sid], initem);
    this.refreshRequiresAfter(initem.sid);
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
    const sdict = ConfigSchema.emptyOrderedSchema();
    // Regex for #define NAME [VALUE] [COMMENT] with sanitized line
    const defgrep = /^(\/\/)?\s*(#define)\s+([A-Za-z0-9_]+)\s*(.*?)\s*(\/\/.+)?$/;
    // Regex for #define MACRONAME() [VALUE] [COMMENT] with sanitized line
    const macrogrep = /^(\/\/)?\s*(#define)\s+([A-Za-z0-9_]+)(\(.*?\)\s*(.*?))\s*(\/\/.+)?$/;
    // Defines to ignore
    const ignore = ['CONFIGURATION_H_VERSION', 'CONFIGURATION_ADV_H_VERSION', 'CONFIG_EXAMPLES_DIR', 'LCD_HEIGHT'];
    // Start with unknown state
    var state = Parse.NORMAL;
    // Serial ID
    var sid = 0;

    // Loop through files and parse them line by line
    var section = 'none',     // Current Settings section
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
      if (state == Parse.EOL_COMMENT) {
        if (defmatch == null && the_line.startsWith('//')) {
          // Continue to add onto the comment. No JSON is expected.
          comment_buff.push(the_line.slice(2).trim());
          log("... EOL comment", line_number);
        }
        else {
          if (last_added_ref !== undefined) { // Ignore EOL comments before any #define
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
            if (cmt != '') comment_buff.push(cmt);
          }
        }
        else if (c.startsWith('@section'))    // Start a new section
          section = c.slice(8).trim();
        else if (!c.startsWith('========'))
          comment_buff.push(c);
      }

      // For slash comments, capture consecutive slash comments.
      // The comment will be applied to the next #define.
      if (state == Parse.SLASH_COMMENT) {
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
      var cline = '';
      if ([Parse.BLOCK_COMMENT, Parse.GET_SENSORS].includes(state)) {

        const endpos = line.indexOf('*/');
        if (endpos < 0)
          cline = line;
        else {
          cline = line.slice(0, endpos).trim();
          line = line.slice(endpos + 2).trim();

          // Temperature sensors are done
          if (state == Parse.GET_SENSORS) {
            // Get up to the last 2 characters of the options_json string
            options_json = `{ ${options_json.slice(0, -2)} }`;
          }

          state = Parse.NORMAL;
          log("End block comment", line_number);
        }

        // Strip the leading '*' from block comments
        cline = cline.replace(/^\* ?/, '');

        const tline = cline.trim();

        // Collect temperature sensors
        if (state == Parse.GET_SENSORS) {
          const sens = tline.match(/^(-?\d+)\s*:\s*(.+)$/);
          if (sens) {
            //log(`Sensor: ${sens[1]} = ${sens[2]}`, line_number);
            const s2 = sens[2].replace(/(['"])/g, "\\$1");
            options_json += `'${sens[1]}':'${sens[1]} - ${s2}', `;
          }
        }
        else if (state == Parse.BLOCK_COMMENT) {
          // Look for temperature sensors
          if (tline.match(/temperature sensors.*:/i)) {
            state = Parse.GET_SENSORS;
            cline = "Temperature Sensors";
            //log("Starting sensors list", line_number);
          }
          use_comment(cline);
        }
      } // end COMMENT, SENSORS
      // For the normal state we're looking for any non-blank line
      else if (state == Parse.NORMAL) {
        // Skip a commented define when evaluating comment opening
        const st = line.match(/^\/\/\s*#define/) ? 2 : 0,
          cpos1 = line.indexOf('/*'),      // Start a block comment on the line?
          cpos2 = line.indexOf('//', st);  // Start an end of line comment on the line?

        // Only the first comment starter gets evaluated
        var cpos = -1;
        if (cpos1 != -1 && (cpos1 < cpos2 || cpos2 == -1)) {
          cpos = cpos1;
          state = Parse.BLOCK_COMMENT;
          oneshot_opt = false;
          log("Begin block comment", line_number);
        }
        else if (cpos2 != -1 && (cpos2 < cpos1 || cpos1 == -1)) {
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
        if (cpos != -1) {
          comment_buff = [];
          cline = line.slice(cpos + 2).trim();
          line = line.slice(0, cpos).trim();

          if (state == Parse.BLOCK_COMMENT) {
            // Strip leading '*' from block comments
            cline = cline.replace(/^\* ?/, '');
          }
          else {
            // Expire end-of-line options after first use
            if (cline.startsWith(':')) oneshot_opt = true;
          }

          // Buffer a non-empty comment start
          if (cline != '') use_comment(cline);
        }

        // If the line has nothing before the comment, go to the next line
        if (line == '') {
          options_json = '';
          continue;
        }

        // Parenthesize the given expression if needed
        function atomize(s) {
          if (s == ''
            || /^[A-Za-z0-9_]*(\([^)]+\))?$/.test(s)
            || /^[A-Za-z0-9_]+ == \d+?$/.test(s)
          ) return s;
          return `(${s})`;
        }

        // Combine adjacent conditions where possible
        function combine_conditions(condarr) {
          var cond = '(' + condarr.flat().join(') && (') + ')';
          while (true) {
            const old_cond = '' + cond;
            cond = cond.replace('!ENABLED', 'DISABLED').replace('!DISABLED', 'ENABLED')
              .replace(/ENABLED\s*\(\s*([A-Z0-9_]+)\s*\)\s*&&\s*ENABLED\s*\(\s*/g, 'ALL($1, ')
              .replace(/(ALL|BOTH)\s*\(\s*([^()]+?)\s*\)\s*&&\s*ENABLED\s*\(\s*/g, 'ALL($2, ')
              .replace(/ENABLED\s*\(\s*([A-Z0-9_]+)\s*\)\s*&&\s*(ALL|BOTH)\s*\(\s*/g, 'ALL($1, ')
              .replace(/ENABLED\s*\(\s*([A-Z0-9_]+)\s*\)\s*\|\|\s*ENABLED\s*\(\s*/g, 'ANY($1, ')
              .replace(/(ANY|EITHER)\s*\(\s*([^()]+?)\s*\)\s*\|\|\s*ENABLED\s*\(\s*/g, 'ANY($2, ')
              .replace(/(NONE|DISABLED)\s*\(\s*([^()]+?)\s*\)\s*&&\s*(NONE|DISABLED)\s*\(\s*/g, 'NONE($2, ')
              .replace(/DISABLED\s*\(\s*([A-Z0-9_]+)\s*\)\s*\|\|\s*DISABLED\s*\(\s*/g, '!ALL($1, ')
              .replace(/!(ALL|BOTH)\s*\(\s*([^()]+?)\s*\)\s*\|\|\s*(DISABLED|!ALL|!BOTH)\s*\(\s*/g, '!ALL($2, ')
              .replace(/^\((!?[A-Z]+\([^()]+?\))\)$/, '$1');
            if (old_cond == cond) break;
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
          iselif = drctv == '#elif',
          iselse = drctv == '#else';

        if (iselif || iselse || drctv == '#endif') {
          if (conditions.length == 0) {
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
        else if (drctv == '#if') {
          conditions.push([atomize(line.slice(3).trim())]);
          if_depth++;
          log(`Level ${if_depth} #if`, line_number);
        }
        else if (drctv == '#ifdef') {
          conditions.push([`defined(${line.slice(6).trim()})`]);
          if_depth++;
          log(`Level ${if_depth} #ifdef`, line_number);
        }
        else if (drctv == '#ifndef') {
          conditions.push([`!defined(${line.slice(7).trim()})`]);
          if_depth++;
          log(`Level ${if_depth} #ifndef`, line_number);
        }
        else if (defmatch) {
          // Handle a complete #define line

          const define_name = defmatch[3];

          // Certain defines are always left out of the schema
          if (ignore.includes(define_name)) continue;

          // "enabled" indicated it's not commented out
          const enabled = !defmatch[1];

          // Disabled conditionals can be left out entirely.
          // All others are retained since conditions can change.
          if (!enabled && section == '_') continue;

          log(`Got #define ${define_name}`, line_number);

          var val = defmatch[4];

          // Increment the serial ID
          sid++;

          // Type is based on the value
          var value_type;
          if (val == '') {
            value_type = 'switch';
          }
          else if (/^[A-Z0-9_]+_PIN$/.test(define_name)) {
            value_type = 'pin';
          }
          else if (/^(true|false)$/i.test(val)) {
            value_type = 'bool';
            val = val == 'true';
          }
          else if (/^[-+]?\s*\d+$/.test(val)) {
            value_type = 'int';
            val = val * 1;
          }
          else if (/^[-+]?\s*(\d+\.|\d*\.\d+)([eE][-+]?\d+)?[fF]?$/.test(val)) {
            value_type = 'float'
            val = val.replace('f', '') * 1;
          }
          else if (macrogrep.test(line)) {
            value_type = 'macro';
          }
          else {
            value_type = (
                val[0] == '"' ? 'string'
              : val[0] == "'" ? 'char'
              : /^(LOW|HIGH)$/i.test(val) ? 'state'
              : /^[A-Z0-9_]{2,}$/i.test(val) ? 'enum'
              : /^{\s*(0x[A-F0-9]{2}\s*,?\s*){6}}$/i.test(val) ? 'mac'
              : /^{(\s*[-+]?\s*\d+\s*(,\s*)?)+}$/.test(val) ? 'int[]'
              : /^{(\s*[-+]?\s*(\d+\.|\d*\.\d+)([eE][-+]?\d+)?[fF]?\s*(,\s*)?)+}$/.test(val) ? 'float[]'
              : val[0] == '{' ? 'array'
              : ''
            );
          }

          // Create a new dictionary for the current #define
          var define_info = {
            'section': section,
            'name': define_name,
            'enabled': enabled,
            'line': line_start,
            'sid': sid,
            'orig': { 'enabled': enabled },
          };

          if (val !== '') { define_info.value = val; define_info.orig.value = val; }
          if (value_type != '') define_info.type = value_type;

          if (conditions.length) {
            define_info.requires = combine_conditions(conditions);
            define_info.depth = if_depth;
          }

          // Does the item belong to a "radio button" group?
          const group = this.itemGroup(define_info);
          if (group) define_info.group = group;

          // Items that depend on TEMP_SENSOR_* to be enabled.
          function is_heater_item(name) {
            const m1 = name.match(/^(EXTRUDER|HOTEND|BED|CHAMBER|COOLER|PROBE)_(AUTO_FAN_(TEMPERATURE|SPEED)|BETA|M(AX|IN)TEMP|OVERSHOOT|PULLUP_RESISTOR_OHMS|RESISTANCE_25C_OHMS|SH_C_COEFF)$/);
            if (m1) return [ 'EXTRUDER', 'HOTEND' ].includes(m1[1]) ? '0' : m1[1];
            const m2 = name.match(/^HOTEND(\d)_.+$/);
            if (m2) return m2[1];
            const m3 = name.match(/^HEATER_(\d)_M(AX|IN)TEMP$/);
            if (m3) return m3[1];
            const m4 = name.match(/^PREHEAT_\d_TEMP_(EXTRUDER|HOTEND|BED|CHAMBER|COOLER|PROBE)$/);
            if (m4) return [ 'EXTRUDER', 'HOTEND' ].includes(m4[1]) ? '0' : m4[1];
            return '';
          }

          // Items that depend on EXTRUDERS to be enabled.
          function is_eaxis_item(name) {
            const m1 = name.match(/^E(\d)_(DRIVER_TYPE|AUTO_FAN_PIN|FAN_TACHO_PIN|FAN_TACHO_PULL(UP|DOWN)|MAX_CURRENT|SENSE_RESISTOR|MICROSTEPS|CURRENT|RSENSE|CHAIN_POS|INTERPOLATE|HOLD_MULTIPLIER|CS_PIN|SLAVE_ADDRESS|HYBRID_THRESHOLD)$/);
            if (m1) return m1[1];
            const m2 = name.match(/^CHOPPER_TIMING_E(\d)$/);
            if (m2) return m2[1];
            const m3 = name.match(/^INVERT_E(\d)_DIR$/);
            if (m3) return m3[1];
            const m4 = name.match(/^HEATER_(\d)_M(AX|IN)TEMP$/);
            if (m4) return m4[1];
            const m5 = name.match(/^TEMP_SENSOR_(\d)$/);
            if (m5) return m5[1];
            const m6 = name.match(/^FIL_RUNOUT(\d)_(STATE|PULL(UP|DOWN))$/);
            if (m6) return m6[1];
            if (['DISABLE_IDLE_E', 'STEP_STATE_E', 'NOZZLE_PARK_FEATURE', 'NOZZLE_CLEAN_FEATURE'].includes(name)) return '0';
            return '';
          }

          // Items that depend on *_DRIVER_TYPE to be enabled.
          function is_axis_item(name) {
            const m1 = name.match(/^([XYZIJKUVW]\d?)_(CHAIN_POS|CS_PIN|CURRENT(|_HOME)|ENABLE_ON|HOLD_MULTIPLIER|HOME_DIR|HYBRID_THRESHOLD|INTERPOLATE|MAX_CURRENT|M(AX|IN)_ENDSTOP_(INVERTING|HIT_STATE)|M(AX|IN)_POS|MICROSTEPS|RSENSE|SAFETY_STOP|SENSE_RESISTOR|SLAVE_ADDRESS|STALL_SENSITIVITY)$/);
            if (m1) return m1[1];
            const m2 = name.match(/^(CHOPPER_TIMING|DISABLE(|_INACTIVE|_IDLE)|M(AX|IN)_SOFTWARE_ENDSTOP|SAFE_BED_LEVELING_START|STEALTHCHOP|STEP_STATE)_([XYZIJKUVW]\d?)$/);
            if (m2) return m2[4];
            const m3 = name.match(/^INVERT_(.+)_(DIR|STEP_PIN)$/);
            if (m3) return m3[1];
            const m4 = name.match(/^MANUAL_(.+)_HOME_POS$/);
            if (m4) return m4[1];
            const m5 = name.match(/^CALIBRATION_MEASURE_(.+)M(AX|IN)$/);
            if (m5) return m5[1];
            const m6 = name.match(/^USE_(.+)M(AX|IN)_PLUG$/);
            if (m6) return m6[1];
            const m7 = name.match(/^ENDSTOPPULL(UP|DOWN)_(.+)M(AX|IN)$/);
            if (m7) return m7[2];
            const m8 = name.match(/^AXIS(\d)_(NAME|ROTATES)$/);
            if (m8) return [ 'I', 'J', 'K', 'U', 'V', 'W' ][m8[1] - 4];
            return '';
          }

          function is_serial_item(name) {
            const m1 = name.match(/^BAUDRATE(_(\d))?$/);
            if (m1) return m1[2] || '0';
            if (name == 'BAUD_RATE_GCODE') return '0';
            const m2 = name.match(/^SERIAL_PORT_(\d)$/);
            if (m2) return m2[1] == '2' ? '0' : (m2[1] - 1).toString();
            return '';
          }

          // Some items depend on axes being enabled
          const axis = is_axis_item(define_name),
              eindex = is_eaxis_item(define_name),
              hindex = is_heater_item(define_name),
              sindex = is_serial_item(define_name);

          function extend_requires(cond) {
            if (define_info.requires !== undefined)
              define_info.requires = `${cond} && (${define_info.requires})`;
            else
              define_info.requires = cond;
          }
          if (axis) extend_requires(`HAS_AXIS(${axis})`);
          if (eindex) extend_requires(`HAS_EAXIS(${eindex})`);
          if (hindex) extend_requires(`HAS_SENSOR(${hindex})`);
          if (sindex) extend_requires(`HAS_SERIAL(${sindex})`);

          // If the comment specifies units, add that to the info
          function set_units(comm) {
            var units = comm.match(/^\(([^)]+)\)/);
            if (units) {
              units = units[1];
              if (['s', 'sec'].includes(units)) units = 'seconds';
              define_info.units = units;
            }
          }

          // If the comment_buff is not empty, add the comment to the info
          var full_comment = '';
          if (prev_comment != '') {
            full_comment = prev_comment;
            prev_comment = '';
          }
          else if (comment_buff && state != Parse.EOL_COMMENT) {
            full_comment = comment_buff.join('\n');
            comment_buff = [];
          }
          define_info.comment = full_comment;
          set_units(full_comment); // If the comment specifies units, add that to the info

          // Set the options for the current #define
          if (define_name == "MOTHERBOARD" && boards != '') {
            define_info.options = boards;
          }
          else if (options_json != '') { // Options, thermistors, boards, etc.
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
            if (opts.includes !== undefined)
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

          // If define has already been seen it becomes an array.
          // Done non-destructively to preserve old references.
          if (define_name in sdict[section]) {
            define_info.group = define_name.toLowerCase();
            // The previously defined item or array
            const info = sdict[section][define_name];
            if (info instanceof Array)
              info.push(define_info);
            else {
              info.group = define_info.group;
              sdict[section][define_name] = [info, define_info];
            }
            log(`Duplicate #define ${define_name}`, line_number);
          }
          else {
            // Add the define dict with name as key
            sdict[section][define_name] = define_info;
            log(`Added a define for ${define_name} to section '${section}'`, line_number);
          }
          // Keep an index by SID
          this.bysid[sid] = define_info;
          if (state == Parse.EOL_COMMENT) last_added_ref = define_info;
        }
        else {
          // For an #undef mark all previous instances of the name disabled and
          // add an 'undef' field containing the sid it was undefined after.
          // If it was already undefined earlier, don't override that sid.
          const unmatch = line.match(/^\s*#undef\s+([^\s]+)/);
          if (unmatch) {
            const name = unmatch[1];
            var isactive = true;
            if (conditions.length) {
              var define_info = {
                name, sid,
                'enabled': true,
                'line': line_start,
                'requires': combine_conditions(conditions)
              };
              this.evaluateRequires(define_info);
              isactive = define_info.evaled;
            }
            if (isactive) {
              for (const [sect, opts] of Object.entries(sdict)) {
                if (name in opts) {
                  const foo = opts[name];
                  if (foo instanceof Array)
                    for (const item of foo) {
                      if (item.undef === undefined) item.undef = sid;
                    }
                  else {
                    if (foo.undef === undefined) foo.undef = sid;
                  }
                }
              }
            }
          }
        }
      } // end NORMAL
    } // loop lines

    // Replace the data with the new schema
    this.data = sdict;

    // Clear out empty sections added to ensure the section order.
    this.removeUnusedSections();

    // Evaluate the enabled state of all items, filling in all 'eval' fields.
    this.refreshAllRequires();
  }

} // end class ConfigSchema

/**
 * MultiSchema encapsulates the complete configuration schema so
 * requirements in the second configuration can be evaluated.
 */
class MultiSchema {
  constructor(schemas) {
    fromSchemas(schemas);
  }

  fromSchemas(schemas) {
    this.schemas = schemas;
    refresh();
  }

  // Return all schemas merged together in the instantiated order
  refresh() {
    let data = {};
    for (const schema of this.schemas) {
      for (const [sect, opts] of Object.entries(schema.data)) {
        if (!(sect in data)) data[sect] = {};
        for (const [name, info] of Object.entries(opts)) {
          if (!(name in data[sect])) data[sect][name] = {};
          for (const [key, val] of Object.entries(info)) {
            data[sect][name][key] = val;
          }
        }
      }
    }
    this.combo = ConfigSchema.fromData(data);
  }

  schema() { return this.combo; }
}

try {
  // Export the class as a module
  module.exports.ConfigSchema = ConfigSchema;
  log('ConfigSchema loaded as a module');
}
catch (e) {
  // The class is in the global scope
  log('ConfigSchema loaded as a global');
}
