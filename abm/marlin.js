/**
 * Auto Build Marlin
 * abm/marlin.js - Functions to parse, read, and write Marlin configs.
 */

const path = require('path'),
        fs = require('fs'),
        os = require('os');

const vscode = require('vscode'), ws = vscode.workspace,
      workspaceRoot = (ws && ws.workspaceFolders && ws.workspaceFolders.length) ? ws.workspaceFolders[0].uri.fsPath : '';

var temp = {}, bugme = false;

function init(b) { bugme = b; }

function reboot() {

}

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
function _confEnabled(text, optname) {
  const find = new RegExp(`^\\s*#define\\s+${optname}\\b`, 'gm'),
        r = find.exec(text);
  if (bugme) console.log(`${optname} is ${r?'ENABLED':'unset'}`);
  return (r !== null); // Any match means it's uncommented
}

// Get whether a setting is enabled (defined) in one or both config files
function confEnabled(fileid, optname) { return _confEnabled(files[fileid].text, optname); }
function configEnabled(optname)       { return confEnabled('config',     optname); }
function configAdvEnabled(optname)    { return confEnabled('config_adv', optname); }
function configAnyEnabled(optname) {
  return configEnabled(optname) ? true : configAdvEnabled(optname);
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
  if (configEnabled(optname))    return configValue(optname)
  if (configAdvEnabled(optname)) return configAdvValue(optname);
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

function filePathForID(fileid) { return fullPathForFileDesc(files[fileid]); }

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
// Read a workspace file
// If it's the last file, go on to extract data and update the UI.
//
function processMarlinFile(fileid, onSuccess, onError) {

  const mf_path = filePathForID(fileid);

  if (bugme) console.log(`Reading... ${mf_path}`);

  if (temp.filesToLoad) {
    fs.readFile(mf_path, (err, data) => {
      if (err)
        onError(err, `Couldn't read ${files[fileid].name}`);
      else {
        files[fileid].text = data.toString();
        if (--temp.filesToLoad == 0) onSuccess();
      }
    });
  }
  else {
    try {
      // Use node.js to read the file
      //var data = fs.readFileSync(mf_path);
      files[fileid].text = fs.readFileSync(mf_path, {encoding:'utf8'});
    } catch (err) {
      onError(err, `Couldn't read ${files[fileid].name}`);
    }
  }
}

//
// Reload all parsed files and run success/error callback
//
function refreshAll(onSuccess, onError) {
  temp.filesToLoad = Object.keys(files).length;
  for (const fid in files)      // Iterate keys
    processMarlinFile(fid, onSuccess, onError);
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
// Return hashed array { mb, pins_file, archs, archs_arr, envs, (has_debug), (error) }
//
var board_info;
function extractBoardInfo(mb) {
  var r, out = { has_debug: false }, sb = mb.replace('BOARD_', '');

  // Get the include line matching the board
  const lfind = new RegExp(`if\\s*MB\\(.*\\b${sb}\\b.*\\).*\n\\s*(#include.+)\n`, 'g');
  if ((r = lfind.exec(files.pins.text))) {

    let inc_line = r[1];

    out.mb = mb;
    out.pins_file = inc_line.replace(/.*#include\s+"([^"]*)".*/, '$1');

    out.archs = inc_line.replace(/.+\/\/\s*((\w+,?\s*)+)\s*(env|mac|win|lin|uni):.+/, '$1');
    out.archs_arr = out.archs.replace(',',' ').replace(/\s+/,' ').trim().split(' ');

    out.envs = [];
    var efind = new RegExp('(env|mac|win|lin|uni):(\\w+)', 'g');
    const plat = process.platform;
    while ((r = efind.exec(inc_line))) {
      var is_win = plat == 'win32',
          is_mac = plat == 'darwin',
          is_lin = plat == 'linux',
          is_uni = !(is_win || is_mac || is_lin);
      if ( (r[1] == 'win' && !is_win)
        || (r[1] == 'mac' && !is_mac)
        || (r[1] == 'lin' && !is_lin)
        || (r[1] == 'uni' && !is_uni && !is_lin) ) continue;
      let debugenv = r[2].match(/^.+_debug$/i);
      let note = '';
      if (/STM32F....E/.test(r[2])) note = '(512K)';
      else if (/STM32F....C/.test(r[2])) note = '(256K)';
      out.envs.push({ name: r[2], note: note, debug: debugenv, native: r[1] != 'env' });
      if (debugenv) out.has_debug = true;
    }

    // Get the description from the boards.h file
    var cfind = new RegExp(`#define\\s+${mb}\\s+\\d+\\s*//(.+)`, 'gm');
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

  const mtypes = [ 'DELTA', 'MORGAN_SCARA', 'COREXY', 'COREXZ', 'COREYZ', 'COREYX', 'COREZX', 'COREZY' ],
       mpretty = [ 'Delta', 'SCARA', 'CoreXY', 'CoreXZ', 'CoreYZ', 'CoreYX', 'CoreZX', 'CoreZY' ];

  let s = 'Cartesian';
  mtypes.every((v,i) => {
    if (!configEnabled(v)) return true;
    s = mpretty[i]; return false;
  });
  out.style = s;

  let d = out.dimensions = { x: configValue('X_BED_SIZE'), y: configValue('Y_BED_SIZE'), z: configValue('Z_MAX_POS') };

  out.description = `${s} ${d.x}x${d.y}x${d.z}mm`;

  const bed_sensor = configValue('TEMP_SENSOR_BED');
  out.heated_bed = !!(1 * bed_sensor);
  if (out.heated_bed) {
    out.bed_sensor = bed_sensor;
    out.description += ` with Heated Bed (${bed_sensor})`;
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

  if (extruders == 1 && configEnabled('TEMP_SENSOR_1_AS_REDUNDANT'))
    out.sensors[1] = configValue('TEMP_SENSOR_1');

  // Only one of these types is allowed at a time
  const etypes = [ 'SINGLENOZZLE',                           // Single nozzle, multiple steppers
                   'DUAL_X_CARRIAGE',                        // IDEX: single, duplication or mirror
                   'PARKING_EXTRUDER',                       // Parkable, with solenoid
                   'MAGNETIC_PARKING_EXTRUDER',              // Parkable, with magnet
                   'SWITCHING_TOOLHEAD',                     // Switching with servo
                   'MAGNETIC_SWITCHING_TOOLHEAD',            // Switching with magnet
                   'ELECTROMAGNETIC_SWITCHING_TOOLHEAD' ];
       epretty = [ 'Single Nozzle' ];
  etypes.every((v,i) => {
    if (!configEnabled(v)) return true;
    out.type = epretty[i] ? epretty[i] : v.toLabel(); return false;
  });

  // These are mutually-exclusive
  const efancy = [ 'MIXING_EXTRUDER', 'SWITCHING_EXTRUDER', 'SWITCHING_NOZZLE', 'MK2_MULTIPLEXER', 'PRUSA_MMU2' ];
  efancy.every((v) => {
    if (!configEnabled(v)) return true;
    out.fancy = v == 'PRUSA_MMU2' ? 'Prusa MMU2' : v.toLabel();
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

  extruder_info = out;
  return extruder_info;
}

//
// Re-fetch information from the board's pins file(s)
// and re-load the pins file contents into files['pindef'].text
// Return hashed array with { name, path, mb }
//
var pindef_info;
function getPinDefinitionInfo(mb) {
  if (!files.pindef || files.pindef.mb != mb) {
    const pbits = `src/pins/${board_info.pins_file}`.split('/');
    files.pindef = { name: pbits.pop(), path: pbits, mb: mb };
    processMarlinFile('pindef'); // Since temp.filesToLoad == 0 just read the file
  }

  pindef_info = {
    board_name: confValue('pindef', 'BOARD_INFO_NAME').dequote()
  };

  return pindef_info;
}

module.exports = {
  workspaceRoot, pathFromArray,

  files, init, reboot, validate, refreshAll,

  watchConfigurations, watchAndValidate,

  configEnabled,
  configValue, confValue, _confValue,

  extractVersionInfo, extractTempSensors, extractBoardInfo,
  getMachineSettings, getExtruderSettings, getPinDefinitionInfo
};
