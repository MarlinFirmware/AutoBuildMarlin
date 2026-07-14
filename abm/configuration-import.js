/**
 * Auto Build Marlin
 * abm/configuration-import.js
 * Import official Marlin example configurations into local Marlin/ files.
 */

const https = require('https'),
  path = require('path'),
       zlib = require('zlib');

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

async function chooseConfigurationsBranch(version, vw) {
  const branches = await githubApiJson('https://api.github.com/repos/MarlinFirmware/Configurations/branches?per_page=100');
  const names = branches.map((b) => b.name);
  const version_match = (version || '').match(/\d+(?:\.\d+)+/);
  if (!version_match) {
    vw.showErrorMessage(`Unable to detect a numeric Marlin version from "${version || 'unknown'}".`);
    return null;
  }

  const exact = `release-${version_match[0]}`;
  if (!names.includes(exact)) {
    vw.showErrorMessage(
      `No exact matching branch was found in MarlinFirmware/Configurations for ${version_match[0]} (expected ${exact}).`
    );
    return null;
  }

  return exact;
}

async function loadConfigurationTree(branch) {
  const tree = await githubApiJson(`https://api.github.com/repos/MarlinFirmware/Configurations/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (tree.truncated) {
    throw new Error('The configurations tree response was truncated. Please try another branch.');
  }
  return tree.tree || [];
}

async function chooseExampleFolder(branch, tree, vw) {
  const folders = [...new Set(
    tree
      // Treat any folder containing Configuration.h as a selectable preset.
      .filter((n) => n.type === 'blob' && /^config\/examples\/.+\/Configuration\.h$/.test(n.path))
      .map((n) => n.path.replace(/\/Configuration\.h$/, ''))
  )];

  folders.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const picks = folders.map((folder) => {
    const label = folder.replace(/^config\/examples\//, '');
    return {
      label,
      description: branch,
      folder
    };
  });

  const selected = await vw.showQuickPick(picks, {
    placeHolder: 'Select example configuration (Type to search)'
  });

  return selected?.folder;
}

function rawConfigUrl(branch, relativePath) {
  const safe_branch = encodeURIComponent(branch).replace(/%2F/g, '/');
  const safe_path = relativePath.split('/').map((p) => encodeURIComponent(p)).join('/');
  return `https://raw.githubusercontent.com/MarlinFirmware/Configurations/${safe_branch}/${safe_path}`;
}

async function importOfficialConfiguration({ marlin, validate, refreshNewData, vw, vc, vscode, fs }) {
  // Validate workspace early so we only offer import in a real Marlin folder.
  if (!validate(true)) return;

  try {
    await vc.executeCommand('workbench.action.files.saveAll');

    const version_info = await loadMarlinVersionInfo(marlin);
    const branch = await chooseConfigurationsBranch(version_info.vers, vw);
    if (!branch) return;

    const tree = await vw.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading Marlin configurations (${branch})`,
        cancellable: false
      },
      () => loadConfigurationTree(branch)
    );

    const folder = await chooseExampleFolder(branch, tree, vw);
    if (!folder) return;

    const importable = tree
      .filter((n) => n.type === 'blob' && n.path.startsWith(`${folder}/`))
      .map((n) => n.path);

    if (!importable.length) {
      vw.showWarningMessage('No importable configuration files were found in the selected example.');
      return;
    }

    const warning = await vw.showWarningMessage(
      'Import all files from the selected example and overwrite matching local files?',
      {
        modal: true,
        detail: `${folder}\n\nAll files in this example will be copied into your local Marlin/ folder. Existing files with the same path will be overwritten, and additional files will be added.`
      },
      'Import and Overwrite'
    );

    if (warning !== 'Import and Overwrite') return;

    const imported_files = [];
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

    vw.showInformationMessage(
      `Imported ${imported_files.length} file(s) from ${folder} (${branch}) into Marlin/.`
    );

    refreshNewData();
  }
  catch (err) {
    const msg = err?.message || `${err}`;
    vw.showErrorMessage(`Failed to import official configuration: ${msg}`);
  }
}

module.exports = {
  importOfficialConfiguration
};
