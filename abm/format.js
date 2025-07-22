/**
 * Auto Build Marlin
 * abm/format.js
 * Formatting commands for Marlin source code.
 */
'use strict';

const vscode = require("vscode");

require("../proto");

/**
 * Apply additional cleanup to code, after Uncrustify formatting with
 * buildroot/share/extras/uncrustify.cfg
 * TODO:
 * - If most of a file is indented due to wrapping #if directives,
 *   remove that extra level of indentation.
 */
function _codeformat(text) {
  // The current code attempts to indent PP directives and code
  // that was formatted by something other than Uncrustify:
  let result = [],
      indent = 0,
      lines = text.split('\n');
  const len = lines.length;
  for (let i = 0; i < len; i++) {
    let line = lines[i];
    // Outdent for #else, #elif, #endif
    if (line.match(/^\s*#\s*(else|elif|endif)/) && indent) indent--;
    result.push(Array(indent + 1).join('  ') + line);
    // Indent following #if, #else, #elif
    if (line.match(/^\s*#\s*(if|else|elif)/)) indent++;
  }
  return result.join('\n');
}

/**
 * Apply formatting to a pins file, not including indentation.
 */
function _pinsformat(intext) {
  const verbose = false;
  function log(line, msg) {
    if (verbose) console.log(`format.js [${line}] ${msg}`);
  }

  const mpatt = [ '-?\\d+', 'P[A-I]\\d+', 'P\\d_\\d+' ],
        definePatt = new RegExp(`^\\s*(//)?#define\\s+[A-Z_][A-Z0-9_]+\\s+(${mpatt[0]}|${mpatt[1]}|${mpatt[2]})\\s*(//.*)?$`, 'gm'),
        ppad = [ 3, 4, 5 ],
        col_comment = 50,
        col_value_rj = col_comment - 3;

  var mexpr = [];
  for (let m of mpatt) mexpr.push(new RegExp('^' + m + '$'));

  return process_pins_file(intext);

  // Find the pin pattern so non-pin defines can be skipped
  function get_pin_pattern(txt) {
    let r, m = 0, match_count = [ 0, 0, 0 ];
    definePatt.lastIndex = 0;
    while ((r = definePatt.exec(txt)) !== null) {
      let ind = -1;
      if (mexpr.some((p) => {
        ind++;
        const didmatch = r[2].match(p);
        return r[2].match(p);
      }) ) {
        const m = ++match_count[ind];
        if (m >= 10) {
          return { match: mpatt[ind], pad:ppad[ind] };
        }
      }
    }
    return null;
  }

  function process_pins_file(txt) {
    if (!txt.length) return '(no text)';
    const patt = get_pin_pattern(txt);
    if (!patt) return txt;
    const pindefPatt = new RegExp(`^(\\s*(//)?#define)\\s+([A-Z_][A-Z0-9_]+)\\s+(${patt.match})\\s*(//.*)?$`),
           noPinPatt = new RegExp(`^(\\s*(//)?#define)\\s+([A-Z_][A-Z0-9_]+)\\s+(-1)\\s*(//.*)?$`),
            skipPatt = new RegExp('^(\\s*(//)?#define)\\s+(AT90USB|USBCON|BOARD_.+|.+_MACHINE_NAME|.+_SERIAL|.+_TIMER)\\s+(.+)\\s*(//.*)?$'),
           aliasPatt = new RegExp('^(\\s*(//)?#define)\\s+([A-Z_][A-Z0-9_]+)\\s+([A-Z_][A-Z0-9_()]+)\\s*(//.*)?$'),
          switchPatt = new RegExp('^(\\s*(//)?#define)\\s+([A-Z_][A-Z0-9_]+)\\s*(//.*)?$'),
           undefPatt = new RegExp('^(\\s*(//)?#undef)\\s+([A-Z_][A-Z0-9_]+)\\s*(//.*)?$'),
             defPatt = new RegExp('^(\\s*(//)?#define)\\s+([A-Z_][A-Z0-9_]+)\\s+([-_\\w]+)\\s*(//.*)?$'),
            condPatt = new RegExp('^(\\s*(//)?#(if|ifn?def|else|elif)(\\s+\\S+)*)\\s+(//.*)$'),
            commPatt = new RegExp('^\\s{20,}(//.*)?$');
    const col_value_lj = col_comment - patt.pad - 2;
    var r, out = '', check_comment_next = false;
    txt.split('\n').forEach(line => {
      if (check_comment_next)
        check_comment_next = ((r = commPatt.exec(line)) !== null);

      if (check_comment_next)
        // Comments in column 45
        line = ''.rpad(col_comment) + r[1];

      else if ((r = pindefPatt.exec(line)) !== null) {
        //
        // #define MY_PIN [pin]
        //
        log(line, 'pin');
        const pinnum = r[4].charAt(0) == 'P' ? r[4] : r[4].lpad(patt.pad);
        line = r[1] + ' ' + r[3];
        line = line.rpad(col_value_lj) + pinnum;
        if (r[5]) line = line.rpad(col_comment) + r[5];
      }
      else if ((r = noPinPatt.exec(line)) !== null) {
        //
        // #define MY_PIN -1
        //
        log(line, 'pin -1');
        line = r[1] + ' ' + r[3];
        line = line.rpad(col_value_lj) + '-1';
        if (r[5]) line = line.rpad(col_comment) + r[5];
      }
      else if ((r = skipPatt.exec(line)) !== null) {
        //
        // #define SKIP_ME
        //
        log(line, 'skip');
      }
      else if ((r = aliasPatt.exec(line)) !== null) {
        //
        // #define ALIAS OTHER
        //
      log(line, 'alias');
        line = r[1] + ' ' + r[3];
        line += r[4].lpad(col_value_rj + 1 - line.length);
        if (r[5]) line = line.rpad(col_comment) + r[5];
      }
      else if ((r = switchPatt.exec(line)) !== null) {
        //
        // #define SWITCH
        //
        log(line, 'switch');
        line = r[1] + ' ' + r[3];
        if (r[4]) line = line.rpad(col_comment) + r[4];
        check_comment_next = true;
      }
      else if ((r = defPatt.exec(line)) !== null) {
        //
        // #define ...
        //
        log(line, 'def');
        line = r[1] + ' ' + r[3] + ' ';
        line += r[4].lpad(col_value_rj + 1 - line.length);
        if (r[5]) line = line.rpad(col_comment - 1) + ' ' + r[5];
      }
      else if ((r = undefPatt.exec(line)) !== null) {
        //
        // #undef ...
        //
        log(line, 'undef');
        line = r[1] + ' ' + r[3];
        if (r[4]) line = line.rpad(col_comment) + r[4];
      }
      else if ((r = condPatt.exec(line)) !== null) {
        //
        // #if ...
        //
        log(line, 'cond');
        line = r[1].rpad(col_comment) + r[5];
        check_comment_next = true;
      }
      out += line + '\n';
    });
    return out.replace(/\n\n+/g, '\n\n').replace(/\n\n$/g, '\n');
  }

}

function format_command(fn, whole=false) {
  // Get the active text editor
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const document = editor.document,
        selection = editor.selection;

  // Is the document uri a file matching the pattern "pins_*.h"?
  const file = document.uri.fsPath;
  if (file.match(/^.*\/pins\/.*\/pins_[A-Z0-9_]+\.h$/i))
    fn = _pinsformat;
  else
    fn = _codeformat;

  //vscode.commands.executeCommand('editor.action.formatDocument').then(() => {});

  // With no selection, apply to the whole document.
  if (selection.isEmpty) whole = true;
  const range = whole ? new vscode.Range(0, 0, document.lineCount, 0) : selection;

  // We can use the existing editor
  editor.edit(editBuilder => { editBuilder.replace(range, fn(document.getText(range))); })
        .then(success     => { console.log(`Edit ${success ? "successful" : "failed"}`); });
};

// Apply a filter to the selection or whole document.
exports.codeformat = () => { format_command(); };

/**
 * Provider class for a formatter that applies the cascade to C / C++
 * preprocessor directives after formatting has been applied by Uncrustify
 * or another formatter.
 */
class PPFormatProvider {
  constructor(context) { this.context = context; }
  // Called by extension.js to register the provider.
  static register(context) {
    const provider = new PPFormatProvider(context);
    return vscode.languages.registerDocumentFormattingEditProvider(['c','cpp'], provider);
  }
  // document: vscode.TextDocument, returning: vscode.TextEdit[]
  provideDocumentFormattingEdits(document) {
    return [vscode.TextEdit.replace(new vscode.Range(0, 0, document.lineCount, 0), _codeformat(document.getText()))];
  }
  provideDocumentRangeFormattingEdits(document, range, options, token) {
    return [vscode.TextEdit.replace(range, _codeformat(document.getText(range)))];
  }
}
exports.PPFormatProvider = PPFormatProvider;

//exports.edit_example = (document) => {
//  const firstLine = document.lineAt(0);
//  if (firstLine.text !== '>>') {
//    return [vscode.TextEdit.insert(firstLine.range.start, '>>\n')];
//  }
//};

/*
function format(fn, whole=false) {
  const editor = vscode.window.activeTextEditor,
        document = editor.document;

  vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', {
    uri: document.uri,
    options: {
      tabSize: 2,
      insertSpaces: true,
      trimAutoWhitespace: true
    }
  },
  (result) => {
    if (!result) return;
    const text = result.document.getText();
    if (whole) {
      editor.edit((edit) => {
        edit.replace(new vscode.Range(0, 0, document.lineCount, 0), fn(text));
      }).then(() => {
        editor.selection = new vscode.Selection(0, 0, 0, 0);
      });
      return;
    }
    const selection = editor.selection;
    editor.edit((edit) => {
      edit.replace(selection, fn(text));
    }).then(() => {
      editor.selection = new vscode.Selection(selection.start, selection.start);
    });
  });
}
*/
