/**
 * abm/docs.js
 *
 * Provider for the Marlin Docs sidebar.
 * Loads at extension startup.
 *
 * This provider:
 * - Sets up the initial webview for the Marlin Docs sidebar.
 * - Handles commands sent by the Docs webview.
 * - Sends messages to the Docs webview when something changes.
 *
 * The Docs Panel downloads the marlinfw.org search index and
 * displays a search field to find terms in the index.
 * Search results are displayed in a list with links to the website.
 */
'use strict';

const vscode = require("vscode"),
         abm = require('./abm'),
          vw = vscode.window;

const jsonFeedUrl = 'https://marlinfw.org/feeds/feed.json';
class DocsPanelProvider {

  constructor(context) { this.context = context; }

  // Called by extension.js to register the provider.
  static register(context) {
    const provider = new DocsPanelProvider(context);
    return vw.registerWebviewViewProvider(DocsPanelProvider.viewType, provider);
  }

  // Called when the Docs pane is revealed.
  async resolveWebviewView(wvv, wvContext, _token) {
    //console.log("DocsPanelProvider.resolveWebviewView"); console.dir(wvv);

    this._view = wvv; // Take ownership of the webview view.

    // Set up the webview with options and basic html.
    const wv = wvv.webview;
    wv.options = {
      enableScripts: true,
      localResourceRoots: [ this.context.extensionUri ]
    };
    wv.html = await this.getWebViewHtml(wv);

    // Handle show/hide events.
    //wvv.onDidChangeVisibility(() => {
    //  abm.log(`DocsPanelProvider.onDidChangeVisibility: ${wvv.visible}`);
    //});

    // Let go of the webview view when it is closed.
    wvv.onDidDispose(() => {
      abm.log("DocsPanelProvider.onDidDispose:");
      this._view = undefined;
    });

    // Receive message from the webview.
    //function handleMessageFromUI(m) {
    //  abm.log('DocsPanelProvider::handleMessageFromUI', m);
    //  switch (m.type) {
    //    case 'hello':
    //      vw.showInformationMessage('Hello from the webview!');
    //      break;
    //  }
    //}
    //wv.onDidReceiveMessage(handleMessageFromUI);

    // Tell the webview to display something
    // Received by docsview.js:handleMessageToUI
    function updateWebview() {
      wv.postMessage({ type: 'say', text: "hello" }); // docsview.js:handleMessageToUI
    }

    // Update the view now that the pane has been revealed.
    updateWebview();
  }

  // Get the URI for a resource in the webview.
  resourceUri(webview, dir, file) {
    return webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'abm', dir, file));
  }
  jsUri(webview, file) { return this.resourceUri(webview, 'js', file); }

  async fetchMarlinSiteIndex() {
    try {
      const response = await fetch(jsonFeedUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const searchData = await response.text()
      return searchData;
    } catch (error) {
      console.error('Failed to fetch search data:', error);
      return null;
    }
  }

  /**
   * Static HTML as the starting point for the docs webview.
   * Attached scripts are invoked in the webview's context.
   */
  async getWebViewHtml(webview) {
    // Local path to script and css for the webview
    const nonce = abm.getNonce(), // Use a nonce to whitelist which scripts can be run
      jqueryUri = this.jsUri(webview, 'jquery-3.6.0.min.js'),
      vsviewUri = this.jsUri(webview, 'vsview.js'),
      scriptUri = this.jsUri(webview, 'docsview.js'),
         cssUri = this.resourceUri(webview, 'css', 'docsview.css'),
    _searchData = (await this.fetchMarlinSiteIndex()).replaceAll('`', '\\`');

    const merged_html = eval(`\`${ abm.load_html('docs.html') }\``);
    return merged_html;
  }
}

// Static members
DocsPanelProvider.viewType = 'abm.docsView';

// Export the provider
exports.DocsPanelProvider = DocsPanelProvider;

abm.log("DocsPanelProvider (docs.js) loaded");
