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
 * - Sets up the initial webview for a config editor.
 * - Applies changes sent from a config editor to its text file.
 * - Sends messages to a config editor when its file is changed.
 * - Goes away when a config file is closed.
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
 * - For Configuration_adv.h load Configuration.h plus Conditionals-2-LCD.h into
 *   a single text blob, strip out all non-directive lines (disabled directives
 *   are needed to provide a definitive 'disabled' state for requirements), and
 *   process that into the schema first, in a section called '_' (underscore), and
 *   always send that to the view.
 *
 * Currently:
 * - The schema is loaded at startup, and this schema is then used as the canonical
 *   source for the config data displayed in the editors.
 * - Each editor has its own complete copy of its config schema, not just a reference.
 *   Changes made to the local copy need to be applied separately to the global copy.
     handleMessageFromUI() is used to apply changes to the global copy.
 * - A combined schema is stored in the global 'schemas' object, with keys 'basic' and 'advanced'.
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

const vscode = require('vscode'),
          fs = require('fs'),
        path = require('path'),
         abm = require('./abm'),
      marlin = require('./js/marlin'),
      schema = require('./js/schema'),
          vw = vscode.window;

const     ws = vscode.workspace,
      wsRoot = (ws && ws.workspaceFolders && ws.workspaceFolders.length) ? ws.workspaceFolders[0].uri.fsPath : '';

// The boards list is sent to populate the MOTHERBOARD option.
//const board_list = abm.get_boards_list();

// Get the schema for the display and manipulation of configuration info
const ConfigSchema =  schema.ConfigSchema;
var schemas;

// Utility function to get the name of a document from a full path.
const document_name = (document) => document.fileName.split(path.sep).pop();

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
   * This provider method is called when a Config Editor is opened.
   * The passed document creates a closure, since it is used in subfunctions.
   * So there is one instance of this closure for each Config Editor.
   */
  async resolveCustomTextEditor(document, panel, _token) {
    abm.log("ConfigEditorProvider.resolveCustomTextEditor", document.uri);

    // Set values for items in this closure to use
    const doc = document_name(document);
    const my = {
      filename: doc,
      adv: doc == 'Configuration_adv.h',
      wv: panel.webview
    };

    // Keep global references to both views
    webviews[my.filename] = my.wv;

    function reloadSchemas() {
      schemas = schema.combinedSchema(marlin, fs, true);
      my.schema = my.adv ? schemas.advanced : schemas.basic;
      abm.log("abm/editor.js", schemas);
    }
    reloadSchemas();

    // Set up the webview with options and basic html.
    my.wv.options = { enableScripts: true };
    my.wv.html = this.getWebViewHtml(my.wv);

    /**
     * @brief Tell my webview to rebuild itself with new config data.
     * @description Send initial data to this instance's webview so it can build the form.
     */
    function initWebview() {
      // Get the name of the document.
      abm.log(`ConfigEditorProvider.initWebview: ${my.filename}`);

      // Send the pre-parsed data to the web view.
      my.wv.postMessage({ type: 'update', bysec: my.schema.bysec }); // editview.js:handleMessageToUI

      // Parse the text and send it to the webview.
      //sch.importText(document.getText());
      //my.wv.postMessage({ type: 'update', bysec: sch.bysec });

      // Originally the webview received the raw text.
      //my.wv.postMessage({ type: 'update', text: document.getText() });
    }

    /**
     * @brief Update my webview with the latest parsed schema data.
     * @description Send updated data to this instance's webview so it can rebuild the form.
     */
    function updateWebview(external=false) {
      abm.log(`ConfigEditorProvider.updateWebview: ${my.filename}`);

      // Send the parsed data to the basic or advanced config editor view.
      if (external) my.wv.postMessage({ type: 'update', bysec: my.schema.bysec }); // editview.js:handleMessageToUI

      // If this isn't the second config, but that file is open, update its view too.
      if (!my.adv && 'Configuration_adv.h' in webviews) {
        abm.log("updateWebview >> Configuration_adv.h");
        webviews['Configuration_adv.h'].postMessage({ type: 'update', bysec: schemas.advanced.bysec });
      }
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

    /**
     * @brief Listen for changes to the document and update the webview as needed.
     * @description Changes may be internal or external. If the changes are internal
     *              the webview forms will have already been updated.
     *
     *              The event contains a document object with two useful properties:
     *                changes: An array of vscode.TextDocumentContentChangeEvent[]
     *                isDirty: true if the document is dirty (not matching disk contents)
     */
    var wasDirty = false;
    const changeDocumentSubscription = ws.onDidChangeTextDocument(e => {
      abm.log("ws.onDidChangeTextDocument", e);
      const doc = e.document;
      if (doc.uri.fsPath != document.uri.fsPath) return;

      if (wasDirty != doc.isDirty) {
        wasDirty = doc.isDirty;
        abm.log(`${wasDirty ? "" : "(Saved?) "}Document dirty:${wasDirty} closed:${doc.isClosed}`);
      }

      const changes = e.contentChanges;
      if (changes.length == 0) return;

      const change1 = changes[0],
            is_external = !change1.range.isSingleLine || (change1.range.isSingleLine && change1.range.start.character == change1.range.end.character);

      abm.log(
        changes.length + " " + (is_external ? "Ex" : "In") + "ternal change(s) to " + document_name(doc)
        + (doc.isClosed ? " (closed)" : "") + (doc.isDirty ? " (dirty)" : ""),
        "(range:", change1.range.start.line + ":" + change1.range.start.character, "-", change1.range.end.line + ":" + change1.range.end.character + ")"
      );

      // For non-local changes re-parse the file
      if (is_external) reloadSchemas();

      // Update the web view according to the type of change
      updateWebview(is_external);
      // TODO: Optimize to only re-parse the changed file, not always both.
    });

    /**
     * @brief Update a single document line based on the given define item.
     * @description Called in response to 'change' messages sent by the config editor.
     *              Only modifies 'enabled' state and 'value' so nothing too complicated.
     *              This adds "edits" to the document text and optionally applies them.
     *              By using edits they go into the undo/redo stack.
     *              This also leads to onDidChangeTextDocument events, where we need to
     *              distinguish between internal and external changes.
     */
    function applyConfigChange(document, changes, edit=null) {
      abm.log(`ConfigEditorProvider.applyConfigChange: ${my.filename}`, changes);

      // Update the item in our local schema copy.
      my.schema.updateEditedItem({ sid:changes.sid, enabled:changes.enabled, value:changes.value });

      // And for the basic config, update its clone.
      if (!my.adv)
        schemas.advanced.updateEditedItem({ sid:changes.sid, enabled:changes.enabled, value:changes.value });

      // Get the line from the document.
      const line = changes.line - 1,
            text = document.lineAt(line).text;
      abm.log(`${line} : ${text}`);

      // Only handle valid #define lines.
      const defgrep = /^((\s*)(\/\/)?\s*(#define\s+))([A-Za-z0-9_]+)(\s*)(.*?)(\s*)(\/\/.*)?$/,
            match = defgrep.exec(text);

      if (!match) {
        console.warn(`[applyConfigChange] Line ${line} is not a #define: ${text}`);
        return;
      }

      // Init the new text as the existing text of the line
      let newtext = text;

      // Update the value of non-switch options
      if (changes.type != 'switch') {
        newtext = match[1] + match[5] + match[6] + changes.value;
        if (match[8]) {
          const sp = match[8] ? match[8] : ' '
          newtext += sp + match[9];
        }
      }

      // Update un/commenting of #define, as needed
      if (changes.enabled)
        newtext = newtext.replace(/^(\s*)\/\/+\s*(#define)(\s{1,3})?(\s*)/, '$1$2 $4');
      else
        newtext = newtext.replace(/^(\s*)(#define)(\s{1,3})?(\s*)/, '$1//$2 $4');

      abm.log(`${line} : ${newtext}`);

      // Get the range for the whole line
      const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);

      // A single edit can be applied here, or multiple edits can be collected
      // and applied all at once if the caller passes their own WorkspaceEdit.
      const inplace = edit === null;
      if (inplace) edit = new vscode.WorkspaceEdit();

      // Replace the line with the new text
      edit.replace(document.uri, range, newtext);

      // Pad a multi-line value with blank lines to keep line numbers from shifting
      let multiline = (my.schema.bysid[changes.sid].line_end ?? changes.line) - changes.line;
      if (multiline > 0) {
        let clrline = line;
        while (multiline--) {
          ++clrline;
          const range = new vscode.Range(clrline, 0, clrline, Number.MAX_VALUE);
          edit.replace(document.uri, range, "");
        }
      }

      if (inplace) ws.applyEdit(edit);
    }

    // Receive message from the webview via vscode.postMessage.
    // The webview sends changes to apply to the underlying document.
    function handleMessageFromUI(m) {
      abm.log("ConfigEditorProvider.handleMessageFromUI", m);
      switch (m.type) {
        case 'change':
          applyConfigChange(document, m.data); // Update the document text using the given data.
          break;

        case 'multi-change':
          const edit = new vscode.WorkspaceEdit();
          m.changes.forEach(d => { applyConfigChange(document, d.data, edit); });
          ws.applyEdit(edit);
          break;

        case 'hello':
          vw.showInformationMessage("Hello from the webview!");
          break;
      }
    }
    my.wv.onDidReceiveMessage(handleMessageFromUI);

    // Get rid of the listener when our editor is closed.
    panel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      delete webviews[my.filename];
    });

    // Send the Configuration schema to the webview to display as a form.
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
      vsviewUri = this.jsUri(webview, 'vsview.js'),
      schemaUri = this.jsUri(webview, 'schema.js'),
      scriptUri = this.jsUri(webview, 'editview.js'),
        gridUri = this.jsUri(webview, 'grid.js'),
         cssUri = this.resourceUri(webview, 'css', 'editview.css');

    return eval(`\`${ abm.load_html('editor.html') }\``);
  }

}

// Static members
ConfigEditorProvider.viewType = 'abm.configEditor';

// Export the provider
exports.ConfigEditorProvider = ConfigEditorProvider;

abm.log("ConfigEditorProvider (editor.js) loaded");
