/**
 * Auto Build Marlin
 * extension.js
 *
 * NOTES: For 'command failed' check declarations!
 *        Be sure to escape backslashes in "new Regex()"
 */

'use strict';

exports.activate = (context) => {

  const vscode = require('vscode'),
           abm = require('./abm/abm'),
            vc = vscode.commands,
            cs = context.subscriptions;

  abm.init(context, vscode);

  cs.push(vc.registerCommand('mfbuild',     () => { abm.activate('build');     }));
  cs.push(vc.registerCommand('mfupload',    () => { abm.activate('upload');    }));
  cs.push(vc.registerCommand('mftraceback', () => { abm.activate('traceback'); }));
  cs.push(vc.registerCommand('mfclean',     () => { abm.activate('clean');     }));
  cs.push(vc.registerCommand('mfconfig',    () => { abm.activate('config')     }));

};

exports.deactivate = () => {};
