'use strict';

String.prototype.toTitleCase = () => { return this.replace(/([A-Z])(\w+)/gi, function(m,p1,p2) { return p1.toUpperCase() + p2.toLowerCase(); }); }

var vscode = require('vscode');

exports.activate = function(context) {
  //console.log(vscode);

  // Figure out where auto_build.py is located
  var fs = require('fs');
  var AUTO_CMD = 'buildroot/share/atom/auto_build.py';
  fs.access(vscode.workspace.rootPath + '/' + AUTO_CMD, fs.constants.F_OK, function (err) {
    if (err) AUTO_CMD = 'buildroot/share/vscode/auto_build.py';
  });

  var NEXT_TERM_ID = 1;
  var abm_command = function(cmd, nosave) {
    if (!nosave) vscode.commands.executeCommand('workbench.action.files.saveAll');
    var terminal = vscode.window.createTerminal({
      name: `Marlin ${cmd.toTitleCase()} #${NEXT_TERM_ID++}`, 
      env: process.env
    });
    terminal.show(true);
    terminal.sendText(`python ${AUTO_CMD} ${cmd}`);
  };

  context.subscriptions.push(vscode.commands.registerCommand('mfbuild', function(){ abm_command('build'); }));
  context.subscriptions.push(vscode.commands.registerCommand('mfupload', function(){ abm_command('upload'); }));
  context.subscriptions.push(vscode.commands.registerCommand('mftraceback', function(){ abm_command('traceback'); }));
  context.subscriptions.push(vscode.commands.registerCommand('mfclean', function(){ abm_command('clean', true); }));
};

exports.deactivate = function() {

};
