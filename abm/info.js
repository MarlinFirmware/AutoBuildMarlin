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
         abm = require('./abm'),
          vw = vscode.window;

class InfoPanelProvider {

  constructor(context) { this.context = context; }

  // Called by extension.js to register the provider.
  static register(context) {
    const provider = new InfoPanelProvider(context);
    return vw.registerWebviewViewProvider(InfoPanelProvider.viewType, provider);
  }

  // Called when the info pane is revealed.
  async resolveWebviewView(wvv, wvContext, _token) {
    //console.log("InfoPanelProvider.resolveWebviewView"); console.dir(wvv);

    this._view = wvv; // Take ownership of the webview view.

    // Set up the webview with options and basic html.
    const wv = wvv.webview;
    wv.options = {
      enableScripts: true,
      localResourceRoots: [ this.context.extensionUri ]
    };
    wv.html = this.getWebViewHtml(wv);

    // Handle show/hide events.
    wvv.onDidChangeVisibility(() => {
      console.log(`InfoPanelProvider.onDidChangeVisibility: ${wvv.visible}`);
    });

    // Let go of the webview view when it is closed.
    wvv.onDidDispose(() => {
      //console.log("InfoPanelProvider.onDidDispose:");
      this._view = undefined;
    });

    // Receive message from the webview.
    function handleMessage(e) {
      //console.log('InfoPanelProvider::handleMessage'); console.dir(e);
      switch (e.type) {
        case 'hello':
          vw.showInformationMessage('Hello from the webview!');
          break;
      }
    }
    wv.onDidReceiveMessage(handleMessage);

    // Tell the webview to display something.
    function updateWebview() {
      wv.postMessage({ type: 'say', text: "hello" });
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
      scriptUri = this.jsUri(webview, 'infoview.js'),
         cssUri = this.resourceUri(webview, 'css', 'infoview.css');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; ">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${cssUri}" rel="stylesheet" />
  <script nonce="${nonce}" src="${jqueryUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <title>Marlin Info</title>
</head>
<body id="abm-info">
</body>
</html>`;
  }
}

// Static members
InfoPanelProvider.viewType = 'abm.infoView';

// Export the provider
exports.InfoPanelProvider = InfoPanelProvider;

console.log("InfoPanelProvider.js loaded");
