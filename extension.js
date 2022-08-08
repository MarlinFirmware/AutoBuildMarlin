/**
 * Auto Build Marlin
 * extension.js
 *
 * NOTES: For 'command failed' check declarations!
 *        Be sure to escape backslashes in "new Regex()"
 */

'use strict';

const vscode = require('vscode'),
       proto = require('./proto'),
         abm = require('./abm/abm'),
          vc = vscode.commands;

exports.activate = (context) => {

  const cs = context.subscriptions;

  cs.push(vc.registerCommand('abm.build',     () => { abm.run_command('build');     }));
  cs.push(vc.registerCommand('abm.upload',    () => { abm.run_command('upload');    }));
  cs.push(vc.registerCommand('abm.traceback', () => { abm.run_command('traceback'); }));
  cs.push(vc.registerCommand('abm.clean',     () => { abm.run_command('clean');     }));
  cs.push(vc.registerCommand('abm.config',    () => { abm.run_command('config');    }));
  cs.push(vc.registerCommand('abm.show',      () => { abm.run_command();            }));
  cs.push(vc.registerCommand('abm.sponsor',   () => { abm.sponsor();                }));

  abm.init(context, vscode);          // Init the extension (only for Marlin 1.x/2.x folder)
  abm.validate();                     // Validate the workspace for ABM
  abm.watchAndValidate();             // Watch files and folders for changes to update the status
  abm.set_context('active', true);    // Tell VSCode the status to update the UI

  if (abm.pref_show_on_startup()) setTimeout(abm.run_command, 1000);
};

exports.deactivate = () => { abm.set_context('active', false); };
