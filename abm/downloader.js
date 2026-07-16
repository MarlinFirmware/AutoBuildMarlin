/**
 * Auto Build Marlin
 * abm/downloader.js
 *
 * Download Marlin example configurations and use them
 */

const https = require('https'),
       path = require('path'),
       zlib = require('zlib'),
         fs = require('fs'),
    readme = require('./readme-viewer');

const vscode = require('vscode'),
          vc = vscode.commands,
          vw = vscode.window;

// Config files backed up before an example download overwrites them.
const CONFIG_FILES = [ 'Configuration.h', 'Configuration_adv.h', '_Bootscreen.h', '_StatusScreen.h', 'Config.h' ];

// Build a timestamped backup folder name: config-backup-yyyy-mm-dd-hhmmss
function backupFolderName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `config-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Move the current config files into a timestamped backup folder.
// Returns the backup folder path, or null when there is nothing to back up.
function backupConfigs(marlin) {
  const marlinDir = marlin.pathFromArray([]);
  if (!fs.existsSync(marlinDir)) return null;
  const existing = CONFIG_FILES.filter((name) => fs.existsSync(path.join(marlinDir, name)));
  if (!existing.length) return null;

  const backupDir = path.join(marlinDir, backupFolderName());
  fs.mkdirSync(backupDir, { recursive: true });
  for (const name of existing) {
    fs.renameSync(path.join(marlinDir, name), path.join(backupDir, name));
  }
  return backupDir;
}

// Move the backed-up config files back into Marlin/ and remove the backup folder.
function restoreConfigs(backupDir) {
  if (!backupDir || !fs.existsSync(backupDir)) return;
  const marlinDir = path.dirname(backupDir);
  for (const name of fs.readdirSync(backupDir)) {
    const src = path.join(backupDir, name);
    if (fs.statSync(src).isFile()) {
      // Restore the original, replacing any partial download at the same path.
      fs.renameSync(src, path.join(marlinDir, name));
    }
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
}

// Discover local config backups in the Marlin folder (config-backup-* dirs).
// Returns newest-first entries with a display label and raw CONFIGURATION_H_VERSION.
function findBackups(marlin) {
  const marlinDir = marlin.pathFromArray([]);
  if (!fs.existsSync(marlinDir)) return [];
  const re = /^config-backup-(\d{4}-\d{2}-\d{2}-\d{6})$/;
  const out = [];
  for (const name of fs.readdirSync(marlinDir)) {
    const full = path.join(marlinDir, name);
    if (!fs.statSync(full).isDirectory()) continue;
    const m = name.match(re);
    if (!m) continue;
    const cf = path.join(full, 'Configuration.h');
    const text = fs.existsSync(cf) ? fs.readFileSync(cf, 'utf8') : '';
    const ts = m[1];
    const labelName = (marlin._confValue(text, 'CONFIG_EXAMPLES_DIR')
      || marlin._confValue(text, 'CUSTOM_MACHINE_NAME')
      || marlin._confValue(text, 'STRING_CONFIG_H_AUTHOR')
      || marlin._confValue(text, 'MOTHERBOARD')
      || '').replace(/["']/g, '').trim();
    const version = marlin._confValue(text, 'CONFIGURATION_H_VERSION') || '';
    out.push({
      timestamp: ts,
      dir: full,
      label: labelName ? `Restore: ${labelName} (${ts})` : `Restore: ${ts}`,
      version
    });
  }
  out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return out;
}

// Restore a chosen backup: snapshot the current configs into a new backup
// folder, move the backup's files into place, then remove the backup folder.
function restoreFromBackup(marlin, backupDir) {
  backupConfigs(marlin); // current configs -> fresh timestamped backup
  const marlinDir = marlin.pathFromArray([]);
  for (const name of fs.readdirSync(backupDir)) {
    const src = path.join(backupDir, name);
    if (fs.statSync(src).isFile()) {
      fs.renameSync(src, path.join(marlinDir, name));
    }
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
}

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    const fetch = (currentUrl, redirects) => {
      if (redirects > 5) {
        reject(new Error(`Too many redirects while fetching ${url}`));
        return;
      }

      // Use GitHub API-friendly headers and accept compressed payloads for large responses.
      const request = https.get(currentUrl, {
        headers: {
          'User-Agent': 'AutoBuildMarlin',
          'Accept': 'application/vnd.github+json',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      }, (res) => {
        try {
          const status = res.statusCode || 0;
          // Follow redirects (GitHub sometimes redirects API/raw endpoints).
          if (status >= 300 && status < 400 && res.headers.location) {
            const nextUrl = new URL(res.headers.location, currentUrl).toString();
            res.resume();
            fetch(nextUrl, redirects + 1);
            return;
          }

          let stream = res;
          const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
          if (encoding.includes('gzip')) stream = res.pipe(zlib.createGunzip());
          else if (encoding.includes('deflate')) stream = res.pipe(zlib.createInflate());
          else if (encoding.includes('br') && zlib.createBrotliDecompress) stream = res.pipe(zlib.createBrotliDecompress());

          const chunks = [];
          stream.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
          stream.on('error', reject);
          stream.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            if (status !== 200) {
              reject(new Error(`HTTP ${status} for ${currentUrl}: ${body.slice(0, 200)}`));
              return;
            }
            resolve(body);
          });
        }
        catch (err) {
          reject(err);
        }
      });

      request.on('error', reject);
    };

    fetch(url, 0);
  });
}

async function githubApiJson(url) {
  const raw = await httpGetText(url);
  return JSON.parse(raw);
}

async function loadMarlinVersionInfo(marlin) {
  return new Promise((resolve, reject) => {
    marlin.refreshAll(
      () => resolve(marlin.extractVersionInfo()),
      (err, msg) => reject(new Error(`${msg}: ${err?.message || err}`))
    );
  });
}

async function chooseConfigurationsBranch(version) {
  const branches = await githubApiJson('https://api.github.com/repos/MarlinFirmware/Configurations/branches?per_page=100');
  const names = branches.map((b) => b.name);

  const v = version || '';
  // A Marlin "bugfix" build (e.g. "bugfix-2.1.x") tracks the matching
  // Configurations bugfix branch, not a release branch. The release branches
  // lag behind and omit newer examples (e.g. BIBO, BIQU B1 SE).
  const bugfix_match = v.match(/^bugfix-(\d+\.\d+\.x)$/i);
  if (bugfix_match) {
    const exact = `bugfix-${bugfix_match[1]}`;
    if (!names.includes(exact)) {
      vw.showErrorMessage(
        `No matching branch found in MarlinFirmware/Configurations for ${v} (expected ${exact}).`
      );
      return null;
    }
    return exact;
  }

  const version_match = v.match(/\d+(?:\.\d+)+/);
  if (!version_match) {
    vw.showErrorMessage(`Unable to detect a numeric Marlin version from "${v || 'unknown'}".`);
    return null;
  }

  const exact = `release-${version_match[0]}`;
  if (!names.includes(exact)) {
    vw.showErrorMessage(
      `No exact matching branch found in MarlinFirmware/Configurations for ${version_match[0]} (expected ${exact}).`
    );
    return null;
  }

  return exact;
}

async function loadConfigurationTree(branch) {
  const tree = await githubApiJson(`https://api.github.com/repos/MarlinFirmware/Configurations/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (tree.truncated) {
    throw new Error('Configurations tree response truncated. Please try another branch.');
  }
  return tree.tree || [];
}

async function chooseConfigItem(marlin, branch, tree) {
  // Local backups are listed first, each labelled "Restore: <name> (<ts>)".
  const backups = findBackups(marlin).map((b) => ({
    kind: 'restore',
    label: b.label,
    description: b.version,
    dir: b.dir
  }));

  const folders = [...new Set(
    tree
      // Treat any folder containing Configuration.h as a selectable preset.
      .filter((n) => n.type === 'blob' && /^config\/examples\/.+\/Configuration\.h$/.test(n.path))
      .map((n) => n.path.replace(/\/Configuration\.h$/, ''))
  )];

  folders.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const examples = folders.map((folder) => ({
    kind: 'example',
    label: folder.replace(/^config\/examples\//, ''),
    description: branch,
    folder
  }));

  const selected = await vw.showQuickPick([...backups, ...examples], {
    placeHolder: 'Select example configuration or a local restore point (Type to search)'
  });

  return selected;
}

async function doRestoreFromBackup(marlin, backupDir, refreshNewData) {
  const confirm = await vw.showWarningMessage(
    'Restore the selected local backup?',
    {
      modal: true,
      detail: `${path.basename(backupDir)}\n\nThe current configuration files will be backed up first.`
    },
    'Restore Now!'
  );
  if (confirm !== 'Restore Now!') return;

  try {
    restoreFromBackup(marlin, backupDir);
    vw.showInformationMessage(`Restored configuration from ${path.basename(backupDir)}.`);
    refreshNewData();
  }
  catch (err) {
    const msg = err?.message || `${err}`;
    vw.showErrorMessage(`Failed to restore backup: ${msg}`);
  }
}

function rawConfigUrl(branch, relativePath) {
  const safe_branch = encodeURIComponent(branch).replace(/%2F/g, '/');
  const safe_path = relativePath.split('/').map((p) => encodeURIComponent(p)).join('/');
  return `https://raw.githubusercontent.com/MarlinFirmware/Configurations/${safe_branch}/${safe_path}`;
}

async function fetchExampleConfiguration({ marlin, validate, refreshNewData }) {
  // Validate workspace early so we only offer import in a real Marlin folder.
  if (!validate(true)) return;

  try {
    await vc.executeCommand('workbench.action.files.saveAll');

    const version_info = await loadMarlinVersionInfo(marlin);
    const branch = await chooseConfigurationsBranch(version_info.vers);
    if (!branch) return;

    const tree = await vw.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading Marlin Configurations (${branch})`,
        cancellable: false
      },
      () => loadConfigurationTree(branch)
    );

    const item = await chooseConfigItem(marlin, branch, tree);
    if (!item) return;

    // Restore from a local backup instead of downloading an example.
    if (item.kind === 'restore') {
      await doRestoreFromBackup(marlin, item.dir, refreshNewData);
      return;
    }

    const folder = item.folder;

    // Only download Marlin configuration headers (.h). A packaged README is
    // shown separately (not written to disk) when present.
    const importable = tree
      .filter((n) => n.type === 'blob' && n.path.startsWith(`${folder}/`) && n.path.endsWith('.h'))
      .map((n) => n.path);

    // Older examples may omit Configuration_adv.h. Fall back to the shared
    // default so the advanced config is always populated in the target.
    const hasAdv = importable.some((p) => p.endsWith('/Configuration_adv.h'));
    if (!hasAdv) {
      const defaultAdv = tree.find((n) => n.type === 'blob' && n.path === 'config/default/Configuration_adv.h');
      if (defaultAdv) importable.push(defaultAdv.path);
    }

    // Look for a README bundled with the example (README.md or README.txt).
    const readmePath = tree
      .filter((n) => n.type === 'blob' && /^README\.(md|txt)$/i.test(path.basename(n.path))
        && n.path.slice(0, folder.length) === folder)
      .map((n) => n.path)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      [0];

    if (!importable.length) {
      vw.showWarningMessage('No importable configuration files were found in the selected example.');
      return;
    }

    const warning = await vw.showWarningMessage(
      'Download and apply the selected Example Configurations?',
      {
        modal: true,
        detail: `${folder}\n\nCurrent configuration files will be backed up first. Additional files may be added.`
      },
      'Download Now!'
    );

    if (warning !== 'Download Now!') return;

    // Back up the current config files before they are overwritten.
    const backupDir = backupConfigs(marlin);

    const imported_files = [];
    try {
      for (const relpath of importable) {
        const text = await httpGetText(rawConfigUrl(branch, relpath));
        const relativeInExample = relpath.slice(folder.length + 1);
        const relParts = relativeInExample.split('/');
        const targetPath = marlin.pathFromArray(relParts);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        // Mirror example content into local Marlin/, replacing existing files by design.
        fs.writeFileSync(targetPath, text, { encoding: 'utf8' });
        imported_files.push(relativeInExample);
      }
    }
    catch (err) {
      // Restore the originals and drop the backup folder on any failure.
      restoreConfigs(backupDir);
      const msg = err?.message || `${err}`;
      vw.showErrorMessage(`Failed to download example configuration: ${msg}`);
      return;
    }

    // If the example bundles a README, fetch it and show it beside the panel.
    if (readmePath) {
      try {
        const readmeText = await httpGetText(rawConfigUrl(branch, readmePath));
        readme.showReadme(readmeText, `README — ${folder.replace(/^config\/examples\//, '')}`);
      }
      catch (err) {
        // A README failure must not roll back the import; just note it.
        vw.showWarningMessage(`Could not load the bundled README: ${err?.message || err}`);
      }
    }

    vw.showInformationMessage(`Downloaded ${imported_files.length} file(s) from ${folder} (${branch}) to Marlin/.`);

    refreshNewData();
  }
  catch (err) {
    const msg = err?.message || `${err}`;
    vw.showErrorMessage(`Failed to download example configuration: ${msg}`);
  }
}

module.exports = { fetchExampleConfiguration };
