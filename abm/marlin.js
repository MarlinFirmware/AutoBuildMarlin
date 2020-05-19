/**
 * Auto Build Marlin
 *
 * marlin.js
 *
 * Functions used to parse, read, and write Marlin config files
 */

const path = require('path'),
        fs = require('fs'),
        os = require('os');

var vscode, ws, vw, project_path, temp = {}, bugme = false;

function init(v, b) {
  bugme = b;
  vscode = v;
  //vc = v.commands;
  ws = v.workspace;
  project_path = ws.workspaceFolders[0].uri.fsPath;
}

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

//
// Parse configs to get information about all defines
// such as where it occurs, what its parent defines are,
// and so on. Also try to figure out what kind of data is
// expected based on the set value.
//
// Also examine preceding and end-of-line comments to get
// the "help text" and a list of values, if supplied.
//
// This data can then be used to generate one or more form
// fields that trigger update messages, and to update the
// appropriate lines with in the config files in the correct
// value(s) format. Defines that have children will hide
// those children when disabled.
//

var define_list,    // arrays with all define names
    define_occur,   // lines where defines occur in each file
    define_section; // the section of each define

function updateDefineList(cindex, txt) {
  var section = 'hidden',
      leave_out_defines = ['CONFIGURATION_H', 'CONFIGURATION_H_VERSION', 'CONFIGURATION_ADV_H', 'CONFIGURATION_ADV_H_VERSION'],
      define_more = {},
      occ_list = {},
      findDef = new RegExp('^\\s*(//\\s*)?(@section|#define)\\s+(\\w+).*$', 'gm');
  // scan for sections and defines
  var r;
  while((r = findDef.exec(txt)) !== null) {
    var name = r[3];
    if (r[2] == '@section') {
      section = name;
      //console.log("Section: " + name);
    }
    else if (!leave_out_defines.includes(name)) {                 // skip some defines
      //console.log("Define: " + name);
      var lineNum = txt.lineCount(r.index),                       // the line number
          inst = { cindex:cindex, lineNum:lineNum, line:r[0] },   // config, line, section/define
          in_sect = (name in define_more);                        // already found (locally)?

      if (!in_sect) occ_list[name] = [ inst ];                    // no, first item in section

      if (!in_sect && !(name in define_section)) {         // first time in section, ever
        define_more[name] = section; // new first-time define
      }
      else {
        occ_list[name].push(inst);                                // it's another occurrence
      }
    }
  }
  define_list[cindex] = Object.keys(define_more);
  //console.log("Define List " + cindex + ": ", define_list[cindex]);
  define_occur[cindex] = occ_list;
  //console.log("Define Occ " + cindex + ": ", occ_list);
  define_section = Object.assign({}, define_section, define_more);
  if (bugme) console.log("Define Section ", define_section);
}

// Reload all defines over again
function refreshDefineList() {
  define_list = [[],[]];
  define_occur = [{},{}];
  define_section = {};
  updateDefineList(0, files.config.text);
  updateDefineList(1, files.config_adv.text);
  // Display data as an interactive tree
  //console.log("Define list:", define_list);
}

// TODO: Use previously parsed config data for speed

function _confEnabled(text, optname) {
  const find = new RegExp(`^\\s*#define\\s+${optname}\\b`, 'gm'),
        r = find.exec(text);
  if (bugme) console.log(`${optname} is ${r?'ENABLED':'unset'}`);
  return (r !== null); // Any match means it's uncommented
}

function confEnabled(fileid, optname) { return _confEnabled(files[fileid].text, optname); }
function configEnabled(optname)       { return confEnabled('config',     optname); }
function configAdvEnabled(optname)    { return confEnabled('config_adv', optname); }
function configAnyEnabled(optname) {
  return configEnabled(optname) ? true : configAdvEnabled(optname);
}

// Get a single config value
function _confValue(text, optname) {
  var val = '';
  const find = new RegExp(`^\\s*#define\\s+${optname}\\s+(.+)`, 'gm'),
        r = find.exec(text);
  if (r) val = r[1].replace(/\s*(\/\/.*)?$/, '');
  return val;
}

// Get a single config value
function confValue(fileid, optname) { return _confValue(files[fileid].text, optname); }
function configValue(optname)       { return confValue('config',     optname); }
function configAdvValue(optname)    { return confValue('config_adv', optname); }
function configAnyValue(optname) {
  if (configEnabled(optname))    return configValue(optname)
  if (configAdvEnabled(optname)) return configAdvValue(optname);
}

//
// Get the path to a Marlin file
//
function fullPathForFileDesc(f) {
  if (!f.fullpath) {
    let p = '';
    f.path.forEach((v) => { p = path.join(p, v); });
    f.fullpath = path.join(project_path, 'Marlin', p, f.name);
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

function watchAndValidate(handler) {
  unwatchConfigurations();
  watchers = [ fs.watch(path.join(project_path, 'Marlin'), {}, handler) ];
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
// Check for valid Marlin files
//
function validate() {
  for (const k in files) {      // Iterate keys
    const err = fileCheck(k);
    if (err)
      return { ok: false, error: `Error: ${files[k].name} ${err}.` };
  }
  return { ok: true };
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

  //pv.postMessage({ command:'text', text:marlin.files.config.text });

  // Get all the thermistors and save them into an object
  const findAll = new RegExp('^\\s*\\*\\s*Temperature sensors .+$([\\s\\S]+\\*\\/)', 'gm'),
        findEach = new RegExp('^\\s*\\*\\s*(-?\\d+)\\s*:\\s*(.+)$', 'gm'),
        r = findAll.exec(marlin.files.config.text);

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
var board_info;
function extractBoardInfo(mb) {
  var r, out = { has_debug: false }, sb = mb.replace('BOARD_', '');

  // Get the include line matching the board
  const lfind = new RegExp(`if\\s*MB\\(${sb}\\).*\n\\s*(#include.+)\n`, 'g');
  if ((r = lfind.exec(files.pins.text))) {

    let inc_line = r[1];

    out.mb = mb;
    out.pins_file = inc_line.replace(/.*#include\s+"([^"]*)".*/, '$1');

    out.archs = inc_line.replace(/.+\/\/\s*((\w+,?\s*)+)\s*env:.+/, '$1');
    out.archs_arr = out.archs.replace(',',' ').replace(/\s+/,' ').split(' ');

    out.envs = [];
    var efind = new RegExp('env:(\\w+)', 'g');
    while ((r = efind.exec(inc_line))) {
      let debugenv = r[1].match(/^.+_debug$/);
      out.envs.push({ name: r[1], debug: debugenv });
      if (debugenv) out.has_debug = true;
    }
 }
  else {
    const bfind = new RegExp(`#error\\s+"(${mb} has been renamed \\w+)`, 'g');
    out.error = (r = bfind.exec(files.pins.text)) ? r[1] : `Unknown MOTHERBOARD ${mb}`;
  }

  // Get the description from the boards.h file
  var cfind = new RegExp(`#define\\s+${mb}\\s+\\d+\\s*//(.+)`, 'gm');
  r = cfind.exec(files.boards.text);
  out.description = r ? r[1].trim() : '';

  board_info = out;
  return board_info;
}

//
// Get the type of geometry and stuff like that
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
// Get information from the board's pins file(s)
//
var pindef_info;
function getPinDefinitionInfo(mb) {
  if (!files.pindef || files.pindef.mb != mb) {
    const pbits = `src/pins/${board_info.pins_file}`.split('/');
    files.pindef = { name: pbits.pop(), path: pbits, mb: mb };
    processMarlinFile('pindef');
  }

  pindef_info = {
    board_name: confValue('pindef', 'BOARD_INFO_NAME').dequote()
  };

  return pindef_info;
}


module.exports = {
  files, init, reboot, validate, refreshAll,

  watchConfigurations, watchAndValidate,
  refreshDefineList,

  configEnabled,
  configValue, confValue, _confValue,

  extractVersionInfo, extractTempSensors, extractBoardInfo,
  getMachineSettings, getExtruderSettings, getPinDefinitionInfo
};
