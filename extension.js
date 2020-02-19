/**
 * Auto Build Marlin
 * extension.js
 *
 * NOTE: For 'command failed' check declarations!
 */

'use strict';

exports.activate = (context) => {

  const vscode = require('vscode'),
           abm = require('./abm/abm'),
            vc = vscode.commands,
            cs = context.subscriptions;

  abm.init(context);

  cs.push(vc.registerCommand('mfbuild', () => { abm.activate('build'); }));
  cs.push(vc.registerCommand('mfupload', () => { abm.activate('upload'); }));
  cs.push(vc.registerCommand('mftraceback', () => { abm.activate('traceback'); }));
  cs.push(vc.registerCommand('mfclean', () => { abm.activate('clean'); }));
  cs.push(vc.registerCommand('mfconfig', () => { abm.activate('config') }));

}; // activate(context)

exports.deactivate = () => {};
