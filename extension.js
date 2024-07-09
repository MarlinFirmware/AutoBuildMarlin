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
        info = require('./abm/info'),
      editor = require('./abm/editor');

exports.activate = (context) => {

  const vc = vscode.commands,
        cs = context.subscriptions;

  cs.push(
    vc.registerCommand('abm.build',       () => { abm.run_command('build');     }),
    vc.registerCommand('abm.upload',      () => { abm.run_command('upload');    }),
    vc.registerCommand('abm.traceback',   () => { abm.run_command('traceback'); }),
    vc.registerCommand('abm.clean',       () => { abm.run_command('clean');     }),
    vc.registerCommand('abm.config',      () => { abm.run_command('config');    }),
    vc.registerCommand('abm.show',        () => { abm.run_command();            }),
    vc.registerCommand('abm.sponsor',     () => { abm.sponsor();                }),
    vc.registerCommand('abm.codeformat',  () => { format.codeformat();          }),
    vc.registerCommand('abm.export.json', () => { abm.run_schema_py('json');    }),
    vc.registerCommand('abm.apply.ini',   () => { abm.run_configuration_py();   }),

    // Register a webview provider for the Info panel
    info.InfoPanelProvider.register(context),

    // Formatter to do an extra level of indentation for Marlin C++.
    format.PPFormatProvider.register(context),

    // Register a custom editor provider for Configuration files
    editor.ConfigEditorProvider.register(context)
  );

  abm.init(context);                  // Init the abm module before use
  abm.validate();                     // Validate the workspace for ABM
  abm.watchAndValidate();             // Watch files and folders for changes to update the status
  abm.set_context('active', true);    // Tell VSCode the status to update the UI

  // No one actually wants platformio.ini to open, unless they do
  if (!prefs.preserve_pio()) prefs.set_pio_open_ini(false);

  // Show the panel with no command
  if (prefs.show_on_startup()) abm.run_command();
};

exports.deactivate = () => { abm.set_context('active', false); };
