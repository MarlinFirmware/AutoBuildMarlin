/**
 * Auto Build Marlin
 * extension.js
 * Extension entry point. Runs when the extension is activated.
 */

'use strict';

const vscode = require('vscode'),
         abm = require('./abm/abm'),
       prefs = require('./abm/prefs'),
      format = require('./abm/format'),
          vc = vscode.commands;

exports.activate = (context) => {

  const cs = context.subscriptions;

  cs.push(
    vc.registerCommand('abm.build',       () => { abm.run_command('build');     }),
    vc.registerCommand('abm.upload',      () => { abm.run_command('upload');    }),
    vc.registerCommand('abm.traceback',   () => { abm.run_command('traceback'); }),
    vc.registerCommand('abm.clean',       () => { abm.run_command('clean');     }),
    vc.registerCommand('abm.config',      () => { abm.run_command('config');    }),
    vc.registerCommand('abm.show',        () => { abm.run_command();            }),
    vc.registerCommand('abm.sponsor',     () => { abm.sponsor();                }),
    vc.registerCommand('abm.codeformat',  () => { format.codeformat();          }));

  // Formatter to do an extra level of indentation for Marlin C++.
  cs.push(format.PPFormatProvider.register(context));

  abm.init(context);                  // Init the abm module before use
  abm.validate();                     // Validate the workspace for ABM
  abm.watchAndValidate();             // Watch files and folders for changes to update the status
  abm.set_context('active', true);    // Tell VSCode the status to update the UI

  if (prefs.show_on_startup()) setTimeout(abm.run_command, 1000);
};

exports.deactivate = () => { abm.set_context('active', false); };
