/**
 * Auto Build Marlin
 *
 * abm.js
 *
 * Build Tool methods. Config Tool can be separate.
 * 
 */

const REUSE_TERMINAL = true;

// Extend builtins
String.prototype.lpad = function(len, chr) {
  if (chr === undefined) { chr = '&nbsp;'; }
  var s = this+'', need = len - s.length;
  if (need > 0) { s = new Array(need+1).join(chr) + s; }
  return s;
};

String.prototype.dequote = function()        { return this.replace(/"([^"]*)"/g, '$1'); };
String.prototype.prePad = function(len, chr) { return len ? this.lpad(len, chr) : this; };
String.prototype.zeroPad = function(len)     { return this.prePad(len, '0'); };
String.prototype.toHTML = function()         { return jQuery('<div>').text(this).html(); };
String.prototype.regEsc = function()         { return this.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&"); }
String.prototype.lineCount = function(ind)   { var len = (ind === undefined ? this : this.substr(0,ind*1)).split(/\r?\n|\r/).length; return len > 0 ? len - 1 : 0; };
String.prototype.lines = function()          { return this.split(/\r?\n|\r/); };
String.prototype.line = function(num)        { var arr = this.split(/\r?\n|\r/); return num < arr.length ? arr[1*num] : ''; };
String.prototype.replaceLine = function(num,txt) { var arr = this.split(/\r?\n|\r/); if (num < arr.length) { arr[num] = txt; return arr.join('\n'); } else return this; }
String.prototype.toLabel = function()        { return this.replace(/[\[\]]/g, '').replace(/_/g, ' ').toTitleCase(); }
String.prototype.toTitleCase = function()    { return this.replace(/([A-Z])(\w+)/gi, function(m,p1,p2) { return p1.toUpperCase() + p2.toLowerCase(); }); }
Number.prototype.limit = function(m1, m2)  {
  if (m2 == null) return this > m1 ? m1 : this;
  return this < m1 ? m1 : this > m2 ? m2 : this;
};
Date.prototype.fileStamp = function(filename) {
  var fs = this.getFullYear()
    + ((this.getMonth()+1)+'').zeroPad(2)
    + (this.getDate()+'').zeroPad(2)
    + (this.getHours()+'').zeroPad(2)
    + (this.getMinutes()+'').zeroPad(2)
    + (this.getSeconds()+'').zeroPad(2);

  if (filename !== undefined)
    return filename.replace(/^(.+)(\.\w+)$/g, '$1-['+fs+']$2');

  return fs;
}

var mfiles = [
  { name: 'Configuration.h',
    path: [],
    text: '',
    hash: '',
    lines: 0
  },
  { name: 'Configuration_adv.h',
    path: [],
    text: '',
    hash: '',
    lines: 0
  },
  { name: 'pins.h',
    path: ['src', 'pins'],
    text: '',
    hash: '',
    lines: 0
  },
  { name: 'boards.h',
    path: ['src', 'core'],
    text: '',
    hash: '',
    lines: 0
  },
];

const nicer = {
  build: 'build',
  upload: 'upload',
  traceback: 'upload (traceback)',
  clean: 'clean',
};

const vscode = require('vscode'),
        path = require('path'),
          fs = require('fs'),
          os = require('os'),
          vc = vscode.commands,
          ws = vscode.workspace,
          win = vscode.window;

const project_path = ws.workspaceFolders[0].uri.fsPath;

const boards_file = 'boards.h',
      pins_file = 'pins.h',
      config_file = 'Configuration.h',
      config_adv_file = 'Configuration_adv.h';

var info = {},              // For general data without declaring

    boards_text = '',       // Contents of boards.h for parsing
    pins_text = '',         // Contents of pins.h for parsing
    config_text = '',       // Contents of Configuration.h for parsing
    config_adv_text = '';   // Contents of Configuration_adv.h for parsing

var context, abm_path, pv;

function init(c) {
  context = c;
  abm_path = path.join(c.extensionPath, 'abm');
}

var define_list = [[],[]],  // arrays with all define names
    define_occur = [{},{}], // lines where defines occur in each file
    define_section = {};    // the section of each define

function updateDefineList(cindex, txt) {
  var section = 'hidden',
      leave_out_defines = ['CONFIGURATION_H', 'CONFIGURATION_H_VERSION', 'CONFIGURATION_ADV_H', 'CONFIGURATION_ADV_H_VERSION'],
      define_more = {},
      occ_list = {},
      findDef = new RegExp('^.*(@section|#define)[ \\t]+(\\w+).*$', 'gm');
  // scan for sections and defines
  var r;
  while((r = findDef.exec(txt)) !== null) {
    var name = r[2];
    if (r[1] == '@section') {
      section = name;
    }
    else if (!leave_out_defines.includes(name)) {                 // skip some defines
      var lineNum = txt.lineCount(r.index),                       // the line number
          inst = { cindex:cindex, lineNum:lineNum, line:r[0] },   // config, line, section/define
          in_sect = (name in define_more);                        // already found (locally)?

      if (!in_sect) occ_list[name] = [ inst ];                    // no, first item in section

      if (!in_sect && !(name in define_section)) {                // first time in section, ever
        define_more[name] = section; // new first-time define
      }
      else {
        occ_list[name].push(inst);                                // it's another occurrence
      }
    }
  }
  define_list[cindex] = Object.keys(define_more);
  define_occur[cindex] = occ_list;
  define_section = Object.assign({}, define_section, define_more);
}

// TODO: Use previously parsed config data for speed

function configEnabled(txt, optname) {
  var find = new RegExp(`\n[ \\t]*#define[ \\t]+${optname}`, 'gm'),
         r = find.exec(txt);
  return (r !== null); // Any match means it's uncommented
}

// Get a single config value
function configValue(txt, optname) {
  var find = new RegExp(`(//[ \\t]*)?(#define)[ \\t]+(${optname})[ \\t]+(.+)([ \\t]/.+)?`, 'gm'),
         r = find.exec(txt);
  return (r !== null) ? r[4] : '';
}

function marlinFilePath(filename) {
  const morepath = (filename == pins_file) ? path.join('src', 'pins', filename) : filename;
  return path.join(project_path, 'Marlin', morepath);
}

function envBuildPath(env, file) {
  var bp = path.join(project_path, '.pio', 'build', env);
  if (file !== undefined) bp = path.join(bp, file);
  return bp;
}

function existingBuildPath(env) {
  var bp = envBuildPath(env);
  return fs.existsSync(bp) ? bp : null;
}

function marlinFileCheck(filename) {
  var file_issue;
  try {
    fs.accessSync(marlinFilePath(filename), fs.constants.F_OK | fs.constants.W_OK);
  } catch (err) {
    file_issue = err.code === 'ENOENT' ? 'is missing' : 'is read-only';
  }
  return file_issue;
}

//
// Watch Configuration*.h files for changes and refresh the view
// The fs.watch event is fast and usually sends several events.
// So instead of calling refreshNewData directly, put it on a timeout.
//

var timeouts = [];
function onConfigFileChanged(e, fname) {
  if (0) console.log('File changed:', e, fname);
  if (timeouts[fname] !== undefined) clearTimeout(timeouts[fname]);
  timeouts[fname] = setTimeout(() => {
    timeouts[fname] = undefined;
    refreshNewData();
  }, 2000);
}

var watchers = [];
function unwatchConfigurations() {
  watchers.forEach((w) => { w.close() });
  watchers = [];
}

function watchConfigurations() {
  watchers = [
    fs.watch(marlinFilePath(config_file), {}, onConfigFileChanged),
    fs.watch(marlinFilePath(config_adv_file), {}, onConfigFileChanged)
  ];
}

//
// An Environment can be in one of these states:
//  - Does not exist. No Clean option.
//  - Exists and has completed build. Show a Clean option.   .exists
//  - Exists and has incomplete build. Show a Clean option.  .exists.incomplete
//  - Does not exist but build started. Hide all buttons.    .busy
//  - Exists and build is underway. Hide all buttons.        .exists.busy
//
// The strategy is to watch the build folder for changes up to the
// state where the build is underway and the env folder exists.
//
// After that the IPC file signals when the build is done.
//

var build = { watcher:null, env:null, active:false };
function currentBuildEnv() {
  return build.active ? build.env : '(none)';
}

//
// Stop watching the build folder
//
function unwatchBuildFolder() {
  if (build.watcher) {
    if (0) console.log(`Stop Watching Build: ${currentBuildEnv()}.`);
    build.watcher.close();
    build.watcher = null;
  }
  if (build.env)
    refreshBuildStatus(build.env);
}

//
// Watch the build folder for changes in *any* contents.
// As long as contents are changing, a build is occurring.
// Use the cancel-restart method to keep putting off the UI
// update. Only the last timeouts will actually occur.
//
function watchBuildFolder(env) {
  if (!build.watcher) {
    const bp = existingBuildPath(env);
    if (bp) {
      build.watcher = fs.watch(bp, {}, (e,f) => { onBuildFolderChanged(e,f,env); });
      if (0) console.log("Watching Build...");
    }
    else {
      // Build folder doesn't exist (yet)
      // Keep looking for it for several seconds
      if (0) console.log("No build folder yet. Trying in 2s...");
      setTimeout(()=>{ watchBuildFolder(env); }, 2000);
    }
  }
}

var refresh_to = [];
function clearBuildRefresh() {
  refresh_to.forEach(clearTimeout);
  refresh_to = [];
}

function buildIsFinished(reason) {
  if (0) console.log(`buildIsFinished (${reason}): ${currentBuildEnv()}`);
  clearBuildRefresh();
  build.active = false;
  unwatchBuildFolder();
  build.env = null;
}

function onIPCFileChange() {
  buildIsFinished('IPC File Change');  // Assume the build is completed. TODO: Verify contents of the IPC file.
}

function onBuildFolderChanged(e, fname, env) {
  clearBuildRefresh();

  if (fname == 'firmware.hex' || fname == 'firmware.bin') {
    // If the firmware file changed, assume the build is done now
    refresh_to = [ setTimeout(()=>{ unwatchBuildFolder(); }, 500) ];
    if (0) console.log(`onBuildFolderChanged (bin/hex): ${env}`);
  }
  else {
    refresh_to = [
      // Set timeouts that assume lots of changes are underway
      setTimeout(()=>{ refreshBuildStatus(env); }, 500),
      // Assume nothing will pause for more than 15 seconds
      setTimeout(()=>{ unwatchBuildFolder(); }, 15000)
    ];
    if (0) console.log(`onBuildFolderChanged: ${env}`);
  }
}

//
// - Get pins file, archs, and envs for a board
//   from the pins.h file.
// - Get the status of all environment builds.
//
var board_info;
function extractBoardInfo(board) {
  var r, out = {}, sb = board.replace('BOARD_', '');

  // Get the include line matching the board
  var lfind = new RegExp(`if[ \t]*MB\\(${sb}\\).*\n[ \t]*(#include.+)\n`, 'g');

  if ((r = lfind.exec(pins_text))) {

    let inc_line = r[1];

    out.pins_file = inc_line.replace(/.*#include\s+"([^"]*)".*/, '$1');

    out.archs = inc_line.replace(/.+\/\/\s*((\w+,?\s*)+)\s*env:.+/, '$1');
    out.archs_arr = out.archs.replace(',',' ').replace(/\s+/,' ').split(' ');

    out.envs = [];
    var efind = new RegExp('env:(\\w+)', 'g');
    while ((r = efind.exec(inc_line)))
      out.envs.push({ name: r[1] });

    pins_text = undefined; // With data extracted, free some RAM
  }
  board_info = out;
  return board_info;
}

//
// Process data now that all files are loaded
//
//  - Read values from the config files
//  - Update the UI with initial values
//
// TODO: Make a tree view and in that view
//       show status and current build options
//
function allFilesAreLoaded() {

  const mb = configValue(config_text, 'MOTHERBOARD');
  postValue('board', mb.replace('BOARD_', '').replace(/_/g, ' '));

  const extruders = configValue(config_text, 'EXTRUDERS');
  postValue('extruders', extruders);

  const machine = configValue(config_text, 'CUSTOM_MACHINE_NAME');
  postValue('machine', machine.dequote());

  if (mb !== undefined) {

    // Send text for display in the view
    //pv.postMessage({ command:'text', text:pins_text });

    const board_info = extractBoardInfo(mb);
    if (0) console.log("Board Info : ", board_info);

    //pv.postMessage({ command:'binfo', val:board_info });

    // Post Pins file name, Architecture(s), and Environment(s)
    postValue('pins', board_info.pins_file);
    postValue('archs', board_info.archs);

    refreshBuildStatus();
  }

  updateDefineList(0, config_text);

  watchConfigurations();
  runSelectedAction();
}

function refreshOldData() { allFilesAreLoaded(); }

//
// Read a workspace file
// If it's the last file, go on to extract data and update the UI.
//
function processMarlinFile(filename) {

  const mf_path = marlinFilePath(filename);

  if (0) console.log(`Processing... ${mf_path}`);

  // Use node.js to read the file
  fs.readFile(mf_path, (err, data) => {
    if (err) {
      if (0) console.log("fs.readFile err: ", err);
      pv.postMessage({ command:'error', error:`Couldn't find ${filename}`, data:err });
    }
    else {
      let t = data.toString();
      switch (filename) {
        case config_file:     config_text = t; break;
        case config_adv_file: config_adv_text = t; break;
        case pins_file:       pins_text = t; break;
      }
    }
    if (--info.filesToLoad == 0) allFilesAreLoaded();
  });
}

//
// Reload files and refresh the UI
//
function refreshNewData() {
  const files = [ config_file, config_adv_file, pins_file ];
  info.filesToLoad = files.length;

  // Make sure this is a Marlin folder
  let is_marlin = files.every((v) => {
    let err = marlinFileCheck(v);
    if (err) {
      postError(`Error: ${v} ${err}.`);
      return false;
    }
    return true;
  });

  if (is_marlin)
    files.forEach(processMarlinFile);
  else
    postError('Please open Marlin in the workspace.');
}

function lastBuild(env) {
  var bp = envBuildPath(env),
      out = {
        exists: fs.existsSync(bp),
        completed: false,
        busy: build.active && build.env == env,
        stamp: ''
      };

  if (out.exists) {

    // Get the built binary path, if any
    out.completed = true;
    let tp = envBuildPath(env, 'firmware.bin');
    if (!fs.existsSync(tp)) {
      tp = envBuildPath(env, 'firmware.hex');
      if (!fs.existsSync(tp)) {
        out.completed = false;
        tp = bp;
      }
    }

    let stat = fs.lstatSync(tp),
           d = new Date(stat.mtime),
        locd = d.toLocaleDateString({ weekday:'long', year:'numeric', month:'short', day:'numeric' }),
        loct = d.toLocaleTimeString({ timeStyle:'full' });

    out.stamp = `at ${loct} on ${locd}`;
  }
  return out;
}

//
// - Refresh the build status for one or more environments.
// - Send the envs data to the UI for display.
//
function refreshBuildStatus(env) {
  if (0) console.log(`Refreshing Build: ${currentBuildEnv()}`);
  board_info.envs.forEach((v) => {
    if (!env || v.name == env) {
      let b = lastBuild(v.name);
      v.exists    = b.exists;
      v.completed = b.completed;
      v.stamp     = b.stamp;
      v.busy      = b.busy;
    }
  });
  let m = { command:'envs', val:board_info.envs };
  if (0) console.log("Posting:", m);
  pv.postMessage(m);
}

//
// An IPC file for message passing from the Terminal
// This is watched for a command during a build.
// The IPC file is deleted after reading, or when the Terminal or View close.
// (The extension could cancel the Terminal when closing for simplicity,
//  or it could look for a build in progress.)
// It's preferred to put it into the TMP folder, if standard
//
const ipc_file = path.join(os.tmpdir(), 'ipc');
var ipc_watcher;
function createIPCFile() {
  fs.writeFile(ipc_file, 'ipc', (err) => {
    if (!err) {
      if (0) console.log('IPC file created.');
      ipc_watcher = fs.watch(ipc_file, {}, () => { onIPCFileChange(); });
    }
    else
      if (0) console.log('IPC file existed?');
  });
}

function destroyIPCFile() {
  ipc_watcher.close();
  ipc_watcher = null;
  fs.unlink(ipc_file, (err) => {
    if (0) {
      if (err)
        console.log("IPC Delete Error:", err);
      else
        console.log("IPC file deleted.", err);
    }
  });
}

var terminal, NEXT_TERM_ID = 1;
function terminal_command(ttl, cmdline) {
  if (!terminal || !REUSE_TERMINAL) {
    var title;
    if (REUSE_TERMINAL)
      title = 'Marlin Auto Build';
    else {
      title = `Marlin ${ttl.toTitleCase()} (${NEXT_TERM_ID})`;
      NEXT_TERM_ID++;
    }
    terminal = win.createTerminal({ name:title, env:process.env });
    win.onDidCloseTerminal((t) => {
      if (t === terminal) {
        terminal = null;
        buildIsFinished('Closed Terminal');
        setTimeout(refreshBuildStatus, 200);
      }
    });
  }
  else
    if (0) console.log("Terminal PID is " + terminal.processId);

  terminal.show(true);

  if (process.platform == 'win32') {
    terminal.sendText(cmdline);
    terminal.sendText(`echo "done" >${ipc_file}`);
  }
  else
    terminal.sendText(cmdline + ` ; echo "done" >${ipc_file}`);
}

function pio_command(opname, env, nosave) {
  let args;
  switch (opname) {
    case 'build':     args = 'run';                 break;
    case 'clean':     args = 'run --target clean';  break;
    case 'upload':    args = 'run --target upload'; break;
    case 'traceback': args = 'run --target upload'; break;
    //case 'program':   args = 'run --target program';        break;
    //case 'test':      args = 'test upload';                 break;
    //case 'remote':    args = 'remote run --target program'; break;
    //case 'debug':     args = 'debug';                       break;
    default:
      win.showErrorMessage('Unknown action: "' + opname + '"');
      return;
  }
  if (!nosave) vc.executeCommand('workbench.action.files.saveAll');
  terminal_command(opname, `platformio ${args} -e ${env}`);

  // Show the build as 'busy'
  build.env = env;
  build.active = true;
  refreshBuildStatus(env);

  // Start watching the build folder.
  // (Will wait until the folder gets created.)
  if (opname != 'clean') watchBuildFolder(env);
}

function postError(err, data) {
  pv.postMessage({ command:'error', error:err, data:data });
}

function postWIP() {
  postError('Configuration Tool Under Construction');
}

function handleMessage(m) {
  switch (m.command) {

    case 'hello':
      win.showInformationMessage(m.text);
      return;

    case 'wip':
      postWIP();
      break;

    case 'error':
      postError(m.error);
      break;

    case 'ui-ready':
    case 'refresh':
      refreshNewData();
      return;

    case 'pio':
      //win.showInformationMessage('Starting ' + nicer[m.cmd].toTitleCase() + ' for ' + m.env);
      pio_command(m.cmd, m.env);
      return;
  }
}

// Post a value to the UI
function postValue(tag, val) {
  var message = { command:'set', tag:tag, val:val };
  if (0) console.log("Send to UI", message);
  pv.postMessage(message);
}

function subpath(sub, filename) {
  var uri = abm_path;
  if (sub !== '') uri = path.join(uri, sub);
  if (filename !== undefined) uri = path.join(uri, filename);
  return pv.asWebviewUri(vscode.Uri.file(uri));
}

function img_path(filename) { return subpath('img', filename); }
function js_path(filename) { return subpath('js', filename); }
function css_path(filename) { return subpath('css', filename); }

// Contents of the Web View
function homeContent() {
  var jquery_js = js_path('jquery-3.3.1.min.js'),
      abm_js = js_path('webview.js'),
      abm_css = css_path('webview.css'),
      marlin_svg = css_path('marlin.svg'),
      abm_icon = img_path('abm-tools-70.png'),
      btn_build = img_path('btn-build.svg'),
      btn_upload = img_path('btn-upload.svg'),
      btn_debug = img_path('btn-debug.svg'),
      btn_clean = img_path('btn-clean.svg'),
      btn_config = img_path('btn-config.svg'),
      btn_refresh = img_path('btn-refresh.svg'),
      tool_build = img_path('tool-build.svg'),
      tool_config = img_path('tool-config.svg'),
      social_mf = img_path('abm-tools-32.png'),
      social_gh = img_path('social-gh.svg'),
      social_tw = img_path('social-tw.svg'),
      social_fb = img_path('social-fb.svg'),
      social_yt = img_path('social-yt.svg')
      ;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Auto Build Marlin — Home</title>
<link href="https://fonts.googleapis.com/css?family=Fira+Mono&amp;subset=latin,latin-ext" rel="stylesheet" type="text/css" />
<style>
  * { --marlin-svg: url(${marlin_svg}); }
</style>
<script>
//<![CDATA[

  const vscode = acquireVsCodeApi();

  function msg(obj) {
    if (obj.command == 'tool') {
      $('.abm-panel').hide();
      $(\`#abm-\${obj.tool}\`).show();
      $('#abm-toolbar button').removeClass();
      $(\`#btn-\${obj.tool}\`).addClass('active');
    }
    vscode.postMessage(obj);
  }

// ]]>
</script>
<script src="${jquery_js}"></script>
<script src="${abm_js}"></script>
<link rel="stylesheet" href="${abm_css}" type="text/css" media="all" />
</head>
<body>
<div id="abm-layout">
<div id="abm-toolbar">
  <a id="abm-icon" onclick="msg({ command:'refresh' })"><img src="${abm_icon}" width="32" /></a>
  <button id="btn-build" type="button" onclick="msg({ command:'tool', tool:'build' })"><img src="${tool_build}" /><span>Build</span></button>
  <button id="btn-config" type="button" onclick="msg({ command:'tool', tool:'config' })"><img src="${tool_config}" /><span>Configure</span></button>
</div>
<div id="abm-build" class="abm-panel">
  <div id="abm-top">
    <button type="button" onclick="msg({ command:'refresh' })"><img src="${btn_refresh}" /> Refresh</button>
  </div>
  <h1><a href="https://marlinfw.org">Marlin Firmware</a> <span>Auto Build</span></h1>
  <div id="abm-main">
    <table id="info">
      <tr><th>Machine Name:</th>  <td id="info-machine">---</td></tr>
      <tr><th>Extruders:</th>     <td id="info-extruders">---</td></tr>
      <tr><th>Board:</th>         <td id="info-board">---</td></tr>
      <tr><th>Pins:</th>          <td id="info-pins">---</td></tr>
      <tr><th>Architectures:</th> <td id="info-archs">---</td></tr>
      <tr><th>Environments:</th>  <td id="info-envs">---</td></tr>
    </table>
    <div id="abm-button-src">
      <div>
        <div class="env-name"></div>
        <button type="button" onclick="msg({ command:'pio', env:'<env>', cmd:'build' })" title="Build"><img src="${btn_build}" /> Build</button>
        <button type="button" onclick="msg({ command:'pio', env:'<env>', cmd:'upload' })" title="Upload"><img src="${btn_upload}" /> Upload</button>
        <button type="button" onclick="msg({ command:'pio', env:'<env>', cmd:'traceback' })" title="Upload (Traceback)"><img src="${btn_debug}" /> Debug</button>
        <button class="clean" type="button" onclick="msg({ command:'pio', env:'<env>', cmd:'clean' })" title="Clean"><img src="${btn_clean}" /> Clean</button>
        <div class="env-more"></div>
      </div>
    </div>
    <div id="error"></div>
    <div id="debug-text"><pre class="hilightable config"></pre></div>
  </div>
</div>
<div id="abm-config" class="abm-panel">
  <h1><a href="https://marlinfw.org">Marlin Firmware</a> <span>Configuration Tool</span></h1>
  <div>Configuration Tool Under Construction</div>
</div>
<div id="abm-sidebar">
  <div id="abm-social">
    <a href="https://marlinfw.org/"><img src="${social_mf}" /><span>Marlin Home</span></a>
    <a href="https://github.com/MarlinFirmware/Marlin"><img src="${social_gh}" /><span>Marlin on GitHub</span></a>
    <a href="https://twitter.com/MarlinFirmware"><img src="${social_tw}" /><span>@MarlinFirmware</span></a>
    <a href="https://www.facebook.com/groups/1049718498464482/"><img src="${social_fb}" /><span>Marlin on Facebook</span></a>
    <a href="https://www.youtube.com/channel/UCOnKgXMJ5MOuuPFYVgbFsKA"><img src="${social_yt}" /><span>Marlin on YouTube</span></a>
  </div>
</div>
<div id="abm-footer"><span>&copy; 2020 MarlinFirmware</span></div>
</div>
</body>
</html>`;
}

//
// ABM command activation event handler
//
var panel, abm_action;
function activate(action) {
  abm_action = action;
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    runSelectedAction();
  }
  else {

    panel = win.createWebviewPanel(
      'marlinConfig', 'Auto Build Marlin',
      vscode.ViewColumn.One,
      {
        enableCommandUris: true,         // The view can accept commands?
        retainContextWhenHidden: true,   // getState / setState require more work
        enableScripts: true,             // Scripts are needed for command passing, at least?
        localResourceRoots: [
          vscode.Uri.file(abm_path)
        ]
      }
    );

    pv = panel.webview;

    const ipath = path.join(context.extensionPath, 'abm', 'img');
    panel.iconPath = {
      dark: vscode.Uri.file(path.join(ipath, 'favicon-dark.svg')),
      light: vscode.Uri.file(path.join(ipath, 'favicon-light.svg'))
    };

    //
    // Show the URL of the web view CSS
    //
    //var view_url = pv.asWebviewUri(
    //  vscode.Uri.file( path.join(context.extensionPath, 'abm', 'css') )
    //);
    //win.showInformationMessage("CSS URL is " + view_url);

    //
    // Populate the Web View with a cool UI
    // This method lets us pre-generate the HTML
    //
    pv.html = homeContent();

    //var periodic_reset = setInterval(pv.postMessage, 2000, { command: 'reset' });

    panel.onDidDispose(
      () => {
        panel = null;
        unwatchConfigurations();
        unwatchBuildFolder();
        destroyIPCFile();
      },
      null, context.subscriptions
    );

    // Handle messages from the webview
    pv.onDidReceiveMessage(handleMessage, undefined, context.subscriptions);

    // Create an IPC file for messages from Terminal
    createIPCFile();
  }
}

//
// Try to run the launch action, but only
// if the action is unambiguous.
//
function runSelectedAction() {
  var act = abm_action;
  abm_action = undefined;
  if (act !== undefined) {
    if (act == 'config')
      postWIP();
    else {
      let env;
      if (board_info.envs.length == 1)
        env = board_info.envs[0].name;
      else if (act == 'clean') {
        let cleanme, cnt = 0;
        board_info.envs.forEach((v) => { if (v.exists) { cleanme = v.name; cnt++; } });
        if (cnt == 0) {
          postError('Nothing to clean.');
          return;
        }
        if (cnt == 1) env = cleanme;
      }
      if (env)
        pio_command(act, env);
      else
        postError(`Use a specific environment for ${nicer[act]}.`);
    }
  }
}

module.exports = { init, activate };
