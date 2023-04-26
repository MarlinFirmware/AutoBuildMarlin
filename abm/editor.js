/**
 * abm/editor.js
 *
 * Provider for the Configuration file editor.
 * Loads at extension startup.
 *
 * This editor is used for `Configuration.h` and `Configuration_adv.h`, which
 * are just C header files. The config text is parsed into a dictionary
 * which can be used to generate the editor HTML, track changes, etc.
 *
 * This provider:
 *
 * - Sets up the initial webview for the config editor.
 * - Applies changes sent from the config editor.
 * - Sends messages to the config editor when the file is changed.
 * - Goes away when the file is closed.
 *
 * TODO:
 * - With access to all resources, and loading at startup, it makes sense to
 *   load all the needed files into a dictionary, process the entire configuration
 *   here, and send that data (and portions) to the webview instead of the text.
 * - Globals and static elements here are persistent for the lifetime of the
 *   extension and are shared between all editors. So `ConfigEditorProvider.schema`
 *   can be used to store the entire configuration, plus intermediate conditionals,
 *   which are needed to correctly handle the second config file.
 * - The main challenge is to keep all data synchronized. If we only send the data
 *   once (and when external changes are made), we don't need to keep our local
 *   copy of the data in sync. But if we want to send updated data to split views,
 *   for example, we need to keep our local copy in sync.
 * - Before going completely down this local storage road, consider whether it
 *   saves a lot of processing for the second config file. If the second file's view
 *   only uses its own local copy, then it only needs to re-process its part of the
 *   schema for local changes. However, for an external change to Configuration.h,
 *   it still needs to re-process the entire set of configs.
 * - Note that it only needs to process its own part of the config for changes to
 *   its own file. It would get a different message for changes to the other file.
 *
 * So here's the plan:
 * - For Configuration.h do the normal thing and send the entire config schema to the webview.
 * - For Configuration_adv.h load Configuration.h plus Conditionals_LCD.h into
 *   a single text blob, strip out all non-directive lines (disabled directives
 *   are needed to provide a definitive 'disabled' state for requirements), and
 *   process that into the schema first, in a section called '_' (underscore), and
 *   always send that to the view.
 * - It will become clearer in the attempt how best to manage data caching and keep
 *   it all in sync.
 *
 * Currently:
 * - The schema is loaded at startup, and this scheme is then used as the canonical
 *   source for the config data displayed in the editors.
 * - Each editor has its own complete copy of its config schema, not just a reference.
 *   So any changes made to the local copy need to be applied to the global copy.
 * - The combined schema is stored in the global 'schemas' object, with keys 'basic' and 'advanced'.
 * - The schema for the file is sent to the webview when the file is opened,
 *   instead of the text. So we must watch the configs for changes and keep
 *   them in sync, even when no config editor is open.
 *
 * List of editing situations that must be considered:
 * - Editing Configuration_adv.h with or without Configuration.h open.
 *   - The simplest case. Global data is updated, but has no effect on previous lines, so
 *     the Configuration.h 'evaled' fields don't need to be recalculated.
 * - Editing Configuration.h without Configuration_adv.h open.
 *   - Second most simple case. The global data needs to be updated so when Configuration_adv.h
 *     is opened its conditionals will be up to date. The processing of its conditionals
 *     can be delayed until the file is opened in the editor, if that processing is very slow.
 * - Editing Configuration.h with Configuration_adv.h open.
 *   - The second config might be open in a visible view, so in that case it will need to be
 *     synchronized with the global data as edits are made to the first config. But if it is
 *     hidden, then its local copy updates can wait until it is shown again.
 * - Hiding and re-showing.
 *   - We currently save to a state for the editor view, but while in stasis this state
 *     cannot be updated as needed (due to changes to Configuration.h or external changes
 *     to its file). So when the file is re-shown, it may not want to use the saved state.
 *     We can set a flag so that when the view is shown it will use the global data instead,
 *     or just always send that global data over.
 * - External changes that mess up a file.
 *   - Hopefully this will be rare, but all we can do is throw an error and reopen it in the
 *     regular text editor instead. So I need to figure out how to do that.
 */
'use strict';

const vscode = require("vscode"),
         abm = require('./abm'),
      marlin = require('./marlin'),
     _schema = require('./js/schema'),
          vw = vscode.window,
          ws = vscode.workspace,
      wsRoot = (ws && ws.workspaceFolders && ws.workspaceFolders.length) ? ws.workspaceFolders[0].uri.fsPath : '';

const ConfigSchema = _schema.ConfigSchema;
const path = require('path'),
        fs = require('fs'),
        os = require('os');

// The boards list is sent to populate the MOTHERBOARD option.
//const board_list = abm.get_boards_list();

/**
 * Upon loading the extension, read and parse the entire config, with conditionals.
 * Later this may be available more globally, for all our panels and editors to use,
 * along with the boards list, pins details, etc.
 */
function combinedSchema() {
  //return ConfigSchema.newSchema();

  const con1 = marlin.pathFromArray(['Configuration.h']),
        con2 = marlin.pathFromArray(['Configuration_adv.h']),
        cond = marlin.pathFromArray(['src', 'inc', 'Conditionals_LCD.h']);

  // Read all three files into strings.
  const config1 = fs.readFileSync(con1, 'utf8'),
        config2 = fs.readFileSync(con2, 'utf8'),
        configd = fs.readFileSync(cond, 'utf8');

  const sch1 = ConfigSchema.strippedConfig(config1),
        sch2 = ConfigSchema.strippedConfig(configd);

  // Combine configs into one schema to use when editing the second config.
  const adv_combo = '// @section _\n' + sch1.text + sch2.text + '// @section none\n' + config2;

  const prefix_lines = sch1.lines + sch2.lines + 2;

  const s1 = ConfigSchema.fromText(config1),
        s2 = ConfigSchema.fromText(adv_combo, -prefix_lines);

  return { basic: s1, advanced: s2 };
}

const schemas = combinedSchema();
//console.log("abmeditor.js"); console.dir(schemas);

const document_name = document => document.uri.fsPath.split(path.sep).pop();

var webviews = [];

/**
 * A provider class that implements resolveCustomTextEditor.
 * Loaded once, at extension startup.
 */
class ConfigEditorProvider {

  constructor(context) { this.context = context; }

  // Called by extension.js to register the provider.
  static register(context) {
    const provider = new ConfigEditorProvider(context);
    return vw.registerCustomEditorProvider(ConfigEditorProvider.viewType, provider);
  }

  /**
   * This provider method is called when a custom editor is opened.
   * The passed document creates a closure, since it is used in subfunctions.
   */
  async resolveCustomTextEditor(document, webviewPanel, _token) {
    //console.log("ConfigEditorProvider.resolveCustomTextEditor", document.uri);

    // Set values for items in this closure to use
    const name = document_name(document),
          is_adv = name == 'Configuration_adv.h',
          schema = is_adv ? schemas.advanced : schemas.basic;

    // Set up the webview with options and basic html.
    const wv = webviewPanel.webview;
    wv.options = { enableScripts: true };
    wv.html = this.getWebViewHtml(wv);

    // Keep global references to both views
    webviews[name] = wv;

    /**
     * @brief Tell my webview to rebuild the Configuration.
     * @description Send the updated data to this instance's webview so it can rebuild the form.
     */
    function initWebview() {
      // Get the name of the document.
      //console.log(`initWebview: ${name}`);

      // Send the pre-parsed data to the web view.
      wv.postMessage({ type: 'update', schema: schema.data });

      // Parse the text and send it to the webview.
      //sch.importText(document.getText());
      //wv.postMessage({ type: 'update', schema: sch.data });

      // Originally the webview received the raw text.
      //wv.postMessage({ type: 'update', text: document.getText() });
    }

    function updateWebview() {
      // Get the name of the document.
      //console.log(`updateWebview: ${name}`);

      // Send the parsed data to the web view.
      wv.postMessage({ type: 'update', schema: schema.data });

      if (!is_adv && 'Configuration_adv.h' in webviews)
        webviews['Configuration_adv.h'].postMessage({ type: 'update', schema: schemas.advanced.data });
    }

    /**
     * Hook up event handlers to synchronize the webview with the text document.
     *
     * The text document is the Model, so we sync changes in the document to the
     * editor WebView and sync changes in the WebView back to the document.
     *
     * NOTE: A single text document may be shared between multiple custom editors
     * (i.e., in a split custom editor)
     */
    const changeDocumentSubscription = ws.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        //console.log("onDidChangeTextDocument", e);
        if (e.contentChanges.length > 0) updateWebview();
        // TODO: If change is not flagged as local then re-parse the text
        // of the whole file
      }
    });

    // Get rid of the listener when our editor is closed.
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      delete webviews[name];
    });

    /**
     * @brief Update a document option based on the given define item (or array of them).
     * @description Called in response to a 'change' message sent by the config editor.
     */
    function applyConfigChange(document, data, edit=null) {
      //const name = document_name(document);
      //console.log(`applyConfigChange (${name})`); console.dir(data);

      // Update the item in our local schema copy.
      // try {
        schema.updateEditedItem(data);
        schema.refreshAllRequires();
      // }
      // catch (e) {
      //   console.error(`applyConfigChange failed (${name})`);
      // }

      if (!is_adv) {
        schemas.advanced.updateEditedItem(data);
        schemas.advanced.refreshAllRequires();
      }

      // Get the line from the document.
      const line = data.line - 1,
            text = document.lineAt(line).text;
      //console.log(`${line} : ${text}`);

      // Only handle valid #define lines.
      const defgrep = /^((\s*)(\/\/)?\s*(#define\s+))([A-Za-z0-9_]+)(\s*)(.*?)(\s*)(\/\/.*)?$/,
            match = defgrep.exec(text);

      if (!match) {
        console.warn(`[applyConfigChange] Line ${data.line} is not a #define: ${text}`);
        return;
      }

      var newtext = text;

      // Update the value of non-switch options
      if (data.type !== 'switch') {
        newtext = match[1] + match[5] + match[6] + data.value;
        if (match[8]) {
          const sp = match[8] ? match[8] : ' '
          newtext += sp + match[9];
        }
      }

      if (data.enabled)
        newtext = newtext.replace(/^(\s*)\/\/+\s*(#define)(\s{1,3})?(\s*)/, '$1$2 $4');
      else
        newtext = newtext.replace(/^(\s*)(#define)(\s{1,3})?(\s*)/, '$1//$2 $4');

      //console.log("Before edit:", text);
      //console.log("After edit:", newtext);

      // Get the range for the whole line
      const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);

      const inplace = edit === null;
      if (inplace) edit = new vscode.WorkspaceEdit();

      edit.replace(document.uri, range, newtext);

      if (inplace) ws.applyEdit(edit);
    }

    // Receive message from the webview.
    function handleMessage(e) {
      //console.log("(ConfigEditorProvider) handleMessage", e);
      switch (e.type) {
        case 'change':
          applyConfigChange(document, e.data);
          break; // Update the document line based on the data.

        case 'multi-change':
          const edit = new vscode.WorkspaceEdit();
          e.changes.forEach(d => {
            applyConfigChange(document, d.data, edit);
          });
          ws.applyEdit(edit);
          break; // Update the document line based on the data.

        case 'hello':
          vw.showInformationMessage("Hello from the webview!");
          break;
      }
    }
    wv.onDidReceiveMessage(handleMessage);

    // Tell the webview to display the Configuration header file contents.
    initWebview();
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
    const nonce = (0, abm.getNonce)(), // Use a nonce to whitelist which scripts can be run
      jqueryUri = this.jsUri(webview, 'jquery-3.6.0.min.js'),
      schemaUri = this.jsUri(webview, 'schema.js'),
      scriptUri = this.jsUri(webview, 'editview.js'),
        gridUri = this.jsUri(webview, 'grid.js'),
         cssUri = this.resourceUri(webview, 'css', 'editview.css');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' 'unsafe-eval'; ">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${cssUri}" rel="stylesheet" />
  <script nonce="${nonce}" src="${jqueryUri}"></script>
  <script nonce="${nonce}" src="${schemaUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}" src="${gridUri}"></script>
  <title>Configuration Editor</title>
</head>
<body id="abm-conf">
  <form id="filter-form">
    <label for="filter">Filter:</label><input type="search" id="filter" name="filter" />
    <label for="show-comments"><input type="checkbox" id="show-comments" name="show-comments" checked="checked" />Show Comments</label>
    <span id="filter-count"></span>
  </form>
  <div id="config-form"></div>
  <div id="zero-box">0 Results</div>
  <div id="hello-button"><button>Hello!</button></div>
</body>
</html>`;
  }

}

// Static members
ConfigEditorProvider.viewType = 'abm.configEditor';

// Export the provider
exports.ConfigEditorProvider = ConfigEditorProvider;

//console.log("ConfigEditorProvider.js loaded");
