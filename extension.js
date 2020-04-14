/**
 * Auto Build Marlin
 * extension.js
 *
 * NOTES: For 'command failed' check declarations!
 *        Be sure to escape backslashes in "new Regex()"
 */

'use strict';

const vscode = require('vscode'),
         abm = require('./abm/abm'),
          vc = vscode.commands;

exports.activate = (context) => {

  const cs = context.subscriptions;

  cs.push(vc.registerCommand('mfbuild',     () => { abm.run_command('build');     }));
  cs.push(vc.registerCommand('mfupload',    () => { abm.run_command('upload');    }));
  cs.push(vc.registerCommand('mftraceback', () => { abm.run_command('traceback'); }));
  cs.push(vc.registerCommand('mfclean',     () => { abm.run_command('clean');     }));
  cs.push(vc.registerCommand('mfconfig',    () => { abm.run_command('config');    }));
  cs.push(vc.registerCommand('mfshow',      () => { abm.run_command();            }));

  abm.init(context, vscode);
  abm.validate();
  abm.watchAndValidate();
  abm.set_context('abm.active', true);
};

exports.deactivate = () => { abm.set_context('abm.active', false); };
