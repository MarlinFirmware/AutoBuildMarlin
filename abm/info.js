/**
 * abm/info.js
 *
 * Provider for the Marlin Info sidebar.
 * Loads at extension startup.
 *
 * This provider:
 * - Sets up the initial webview for the Marlin Info sidebar.
 * - Handles commands sent by the Info webview.
 * - Sends messages to the Info webview when something changes.
 */
'use strict';

const vscode = require("vscode"),
      marlin = require("./marlin"),
      //schema = require("./js/schema"),
         abm = require('./abm'),
          vw = vscode.window;

const verbose = false; // Lots of debug output
function log(message, data) {
  if (!verbose) return;
  const msg = `[info] ${message}`;
  if (data !== undefined) console.dir([msg, data ]); else console.log(msg);
}

class InfoPanelProvider {

  constructor(context) { this.context = context; }

  // Called by extension.js to register the provider.
  static register(context) {
    const provider = new InfoPanelProvider(context);
    return vw.registerWebviewViewProvider(InfoPanelProvider.viewType, provider);
  }

  // Called when the info pane is revealed.
  async resolveWebviewView(panel, wvContext, _token) {
    //console.log("InfoPanelProvider.resolveWebviewView"); console.dir(panel);

    this._view = panel; // Take ownership of the info view panel

    // Set up the webview with options and basic html.
    const wv = panel.webview;
    wv.options = {
      enableScripts: true,
      localResourceRoots: [ this.context.extensionUri ]
    };
    wv.html = this.getWebViewHtml(wv);

    // Handle show/hide events.
    panel.onDidChangeVisibility(() => {
      console.log(`InfoPanelProvider.onDidChangeVisibility: ${panel.visible}`);
    });

    // Let go of the webview view when it is closed.
    panel.onDidDispose(() => {
      //console.log("InfoPanelProvider.onDidDispose:");
      this._view = undefined;
    });

    // Handle messages from the webview.
    function handleMessageFromUI(m) {
      //console.log('InfoPanelProvider::handleMessageFromUI'); console.dir(m);
      switch (m.type) {
        case 'configs':
          console.dir(m.configs);
          break;
        case 'fetch':
          var config_list = marlin.getConfigurationList(); // Fetch configurations from GitHub to display here
          console.dir(config_list);
          wv.postMessage({ type: 'configs', configs: config_list });
          break;
        case 'hello':
          vw.showInformationMessage('Hello received from the Info webview!');
          break;
      }
    }

    wv.onDidReceiveMessage(handleMessageFromUI, undefined, this.context.subscriptions);

    // Tell the webview to display something.
    function updateWebview() {
      console.log('info.js : updateWebview');
      //wv.postMessage({ type: 'say', text: "hello" }); // infoview.js:handleMessageToUI
      wv.postMessage({ type: 'hello' });
      wv.postMessage({ type: 'fetch' });

      var config_list = marlin.getConfigurationList(); // Fetch configurations from GitHub to display here
      console.dir(config_list);
      wv.postMessage({ type: 'configs', configs: config_list });
    }

    updateWebview();
  }

  // Get the URI for a resource in the webview.
  resourceUri(webview, dir, file) {
    return webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'abm', dir, file));
  }
  jsUri(webview, file) { return this.resourceUri(webview, 'js', file); }

  /**
   * Static HTML as the starting point for editor webviews.
   * Attached scripts are invoked in the webview's context.
   */
  getWebViewHtml(webview) {
    // Local path to script and css for the webview
    const nonce = abm.getNonce(), // Use a nonce to whitelist which scripts can be run
      jqueryUri = this.jsUri(webview, 'jquery-3.6.0.min.js'),
      vscodeUri = this.jsUri(webview, 'vsview.js'),
      scriptUri = this.jsUri(webview, 'infoview.js'),
         cssUri = this.resourceUri(webview, 'css', 'infoview.css');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; ">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${cssUri}" rel="stylesheet" />
  <script nonce="${nonce}" src="${vscodeUri}"></script>
  <script nonce="${nonce}" src="${jqueryUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <title>Marlin Info</title>
</head>
<body id="abm-info">
<div class="alert">Parsing Configurations<br/>Please Wait</div>
<div id="abm-configs"></div>
</body>
</html>`;
  }
}

// Static members
InfoPanelProvider.viewType = 'abm.infoView';

// Export the provider
exports.InfoPanelProvider = InfoPanelProvider;

console.log("InfoPanelProvider.js loaded");
