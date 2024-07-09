/**
 * Auto Build Marlin
 * prefs.js
 * Getters and setters for extension preferences.
 */

const vscode = require("vscode"), ws = vscode.workspace;

function settings() { return ws.getConfiguration('auto-build'); }

function _get_setting(set, name, def=false) { return set.get(name, def); }
function get_setting(name, def=false) { return _get_setting(settings(), name, def); }

function _set_setting(set, name, val) {
  set.update(name, val, set.inspect(name).workspaceValue == undefined);
}
function set_setting(name, val) { _set_setting(settings(), name, val); }

const m = module.exports;

m.show_on_startup      = () => { return get_setting('showOnStart'); }
m.preserve_pio         = () => { return get_setting('preservePIO'); }
m.reuse_terminal       = () => { return get_setting('build.reuseTerminal', true); }
m.silent_build         = () => { return get_setting('build.silent'); }
m.auto_reveal          = () => { return get_setting('build.reveal', true); }

m.default_env          = () => { return get_setting('defaultEnv.name', ''); }
m.default_env_update   = () => { return get_setting('defaultEnv.update', true); }

m.set_show_on_startup  = (sh) => { set_setting('showOnStart', sh); }
m.set_silent_build     = (bs) => { set_setting('build.silent', bs); }
m.set_auto_reveal      = (br) => { set_setting('build.reveal', br); }
m.set_default_env      = (e)  => { set_setting('defaultEnv.name', e); }

m.set_preserve_pio     = (p)  => { set_setting('preservePIO', p); }

m.set_pio_open_ini     = (o) => {
  const pio_set = vscode.workspace.getConfiguration('platformio-ide');
  _set_setting(pio_set, 'autoOpenPlatformIOIniFile', o);
}
