'use strict';

var vscode = require('vscode');

function activate(context) {

  console.log('Extension "AutoBuildMarlin" is now active!');

  const AUTO_CMD1 = 'export TK_SILENCE_DEPRECATION=1 && [[ -f "buildroot/share/vscode/auto_build.py" ]] && python buildroot/share/vscode/auto_build.py',
        AUTO_CMD2 = '|| python buildroot/share/atom/auto_build.py';

  var NEXT_TERM_ID = 1;
  var mf_build     = vscode.commands.registerCommand('mfbuild',     function () {
    vscode.commands.executeCommand('workbench.action.files.saveAll');
    const terminal = vscode.window.createTerminal(`Marlin Build #${NEXT_TERM_ID++}`);
    terminal.show(true);
    terminal.sendText(`${AUTO_CMD1} build ${AUTO_CMD2} build`);
  });
  var mf_upload    = vscode.commands.registerCommand('mfupload',    function () {
    vscode.commands.executeCommand('workbench.action.files.saveAll');
    const terminal = vscode.window.createTerminal(`Marlin Upload #${NEXT_TERM_ID++}`);
    terminal.show(true);
    terminal.sendText(`${AUTO_CMD1} upload ${AUTO_CMD2} upload`);
  });
  var mf_traceback = vscode.commands.registerCommand('mftraceback', function () {
    vscode.commands.executeCommand('workbench.action.files.saveAll');
    const terminal = vscode.window.createTerminal(`Marlin Traceback #${NEXT_TERM_ID++}`);
    terminal.show(true);
    terminal.sendText(`${AUTO_CMD1} traceback ${AUTO_CMD2} traceback`);
  });
  var mf_clean     = vscode.commands.registerCommand('mfclean',     function () {
    const terminal = vscode.window.createTerminal(`Marlin Clean #${NEXT_TERM_ID++}`);
    terminal.show(true);
    terminal.sendText(`${AUTO_CMD1} clean ${AUTO_CMD2} clean`);
  });

  context.subscriptions.push(mf_build);
  context.subscriptions.push(mf_upload);
  context.subscriptions.push(mf_traceback);
  context.subscriptions.push(mf_clean);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;
