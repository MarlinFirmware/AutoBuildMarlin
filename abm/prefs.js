/**
 * Auto Build Marlin
 * prefs.js
 * Getters and setters for extension preferences.
 */

const vscode = require("vscode"), ws = vscode.workspace;

function settings() { return ws.getConfiguration('auto-build'); }
function set_setting(name, val) {
  var glob = settings().inspect(name).workspaceValue == undefined;
  settings().update(name, val, glob);
}

const m = module.exports;

m.show_on_startup      = () => { return settings().get('showOnStart', false); }
m.reuse_terminal       = () => { return settings().get('build.reuseTerminal', true); }
m.silent_build         = () => { return settings().get('build.silent', false); }
m.auto_reveal          = () => { return settings().get('build.reveal', true); }

m.default_env          = () => { return settings().get('defaultEnv.name', ''); }
m.default_env_update   = () => { return settings().get('defaultEnv.update', true); }

m.set_show_on_startup  = (sh) => { set_setting('showOnStart', sh); }
m.set_silent_build     = (bs) => { set_setting('build.silent', bs); }
m.set_auto_reveal      = (br) => { set_setting('build.reveal', br); }
m.set_default_env      = (e)  => { set_setting('defaultEnv.name', e); }
