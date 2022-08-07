/**
 * Auto Build Marlin
 * abm/js/vsview.js
 *
 * Provide some VSCode hooks
 */

const vscode = acquireVsCodeApi();

// Messages sent by buttons back to the view controller abm.handleMessageFromUI(m)
function _msg(m) { vscode.postMessage(m); }
