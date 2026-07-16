/**
 * abm/readme-viewer.js
 *
 * Shows a downloaded example README using VSCode's native Markdown preview.
 * The content is written to a temp file outside the project (so the workspace
 * stays clean) and opened beside the active editor via the built-in Markdown
 * preview engine — full GitHub-style rendering, no extra dependency.
 */

'use strict';

const vscode = require('vscode'),
          os = require('os'),
          fs = require('fs'),
        path = require('path');

const TEMP_DIR = path.join(os.tmpdir(), 'abm-example-readmes');

// Build a filesystem-safe name from a display title.
function safeName(title) {
  const base = String(title || 'README')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'README';
}

// Write the README to a temp file and open VSCode's Markdown preview to the side.
async function showReadme(content, title) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  // Remove previously written temp readmes so they don't accumulate.
  for (const f of fs.readdirSync(TEMP_DIR)) {
    if (f.endsWith('.md')) fs.rmSync(path.join(TEMP_DIR, f), { force: true });
  }

  const file = path.join(TEMP_DIR, `${safeName(title)}.md`);
  fs.writeFileSync(file, content, { encoding: 'utf8' });
  const uri = vscode.Uri.file(file);

  try {
    await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
  }
  catch (err) {
    // Fallback: just open the file as a text document beside the panel.
    await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Beside);
  }
}

module.exports = { showReadme };
