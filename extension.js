const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function findConfigFile(startDir, workspaceRoot) {
  // Remonte depuis le répertoire du fichier jusqu'à la racine du workspace 
  // go up from the file directory to the workspace root
  let currentDir = startDir;
  const rootPath = path.resolve(workspaceRoot);
  
  while (currentDir && currentDir !== path.dirname(currentDir)) {
    // Check if we have passed the workspace root
    if (!currentDir.startsWith(rootPath)) {
      break;
    }
    
    const tsconfigPath = path.join(currentDir, 'tsconfig.json');
    const jsconfigPath = path.join(currentDir, 'jsconfig.json');
    
    if (fs.existsSync(tsconfigPath)) {
      return { configPath: tsconfigPath, projectRoot: currentDir };
    }
    if (fs.existsSync(jsconfigPath)) {
      return { configPath: jsconfigPath, projectRoot: currentDir };
    }
    
    // Go up one level
    currentDir = path.dirname(currentDir);
  }
  
  return null;
}

function getJsconfigPaths(startDir, workspaceRoot) {
  console.log('🔍 Search for jsconfig/tsconfig from:', startDir);
  console.log('   Workspace root:', workspaceRoot);
  
  const configResult = findConfigFile(startDir, workspaceRoot);
  
  if (!configResult) {
    console.log('⚠️ No configuration file found');
    return {};
  }
  
  const { configPath, projectRoot } = configResult;
  console.log(`  ✓ File found: ${configPath}`);
  console.log(`  📁 Project root: ${projectRoot}`);
  
  try {
    let raw = fs.readFileSync(configPath, 'utf8');
  
    // Clean the JSON: remove trailing commas and comments
    // Remove trailing commas and comments
    raw = raw.replace(/\/\/.*$/gm, '');
    // Remove block comments (/* ... */)
    raw = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove trailing commas in objects and arrays
    raw = raw.replace(/,(\s*[}\]])/g, '$1');
    
    const config = JSON.parse(raw);
    
    const compilerOptions = config.compilerOptions || {};
    const baseUrl = compilerOptions.baseUrl || '.';
    const paths = compilerOptions.paths || {};
    
    console.log('  baseUrl:', baseUrl);
    console.log('  paths:', paths);
    
    if (Object.keys(paths).length === 0) {
      console.log('  ⚠️ No paths found in compilerOptions.paths');
      return {};
    }
    
    const resolvedPaths = {};

    for (const alias in paths) {
      // Clean the alias: remove the * at the end
      let cleanAlias = alias.replace(/\*$/, '');
      
      // Clean the target: remove the * at the end
      const target = paths[alias][0].replace(/\*$/, '');
      const resolvedTarget = path.resolve(projectRoot, baseUrl, target);
      
      console.log(`  Alias: "${alias}" -> "${cleanAlias}" -> "${resolvedTarget}"`);
      
      // Store the alias as is (without slash) - the normalization will be done during the matching
      resolvedPaths[cleanAlias] = resolvedTarget;
      
      // Store also with slash if the alias doesn't already have one
      // This allows to match "@/styles" and "@/styles/"
      if (!cleanAlias.endsWith('/')) {
        resolvedPaths[cleanAlias + '/'] = resolvedTarget;
      }
    }

    console.log('✅ Resolved aliases:', resolvedPaths);
    return resolvedPaths;
  } catch (err) {
    console.error(`❌ Error reading ${path.basename(configPath)}:`, err);
    console.error('  Stack:', err.stack);
    return {};
  }
}

function resolveImportPath(importPath, aliasMap, currentFileDir, _workspaceRoot) {
  console.log('Resolution of the path:', importPath);
  console.log('Current directory:', currentFileDir);
  
  // Gère les imports relatifs (./ ou ../)
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const resolved = path.resolve(currentFileDir, importPath);
    console.log('Resolved path (relative):', resolved);
    
    // Helper function to test a path
    const tryResolve = (basePath) => {
      // If the path contains .module.css, check directly
      if (importPath.includes('.module.')) {
        if (fs.existsSync(basePath)) {
          console.log('✓ File found:', basePath);
          return basePath;
        }
        
        // Try different extensions
        const extensions = ['.css', '.scss', '.sass'];
        for (const ext of extensions) {
          const withExt = basePath.replace(/\.(css|scss|sass)$/, ext);
          if (fs.existsSync(withExt)) {
            console.log('✓ File found with extension:', withExt);
            return withExt;
          }
        }
      } else {
        // If no extension, try with .module.css
        const withCss = basePath + '.module.css';
        if (fs.existsSync(withCss)) {
          console.log('✓ File found:', withCss);
          return withCss;
        }
        
        const withScss = basePath + '.module.scss';
        if (fs.existsSync(withScss)) {
          console.log('✓ File found:', withScss);
          return withScss;
        }
        
        const withSass = basePath + '.module.sass';
        if (fs.existsSync(withSass)) {
          console.log('✓ File found:', withSass);
          return withSass;
        }
        
          // Try index.module.css in the directory
        const indexCss = path.join(basePath, 'index.module.css');
        if (fs.existsSync(indexCss)) {
          console.log('✓ File found:', indexCss);
          return indexCss;
        }
      }
      return null;
    };
    
    // Try the resolved path as is
    let result = tryResolve(resolved);
    if (result) return result;
    
    // If it doesn't work and the path starts with ../, try also with ./
    if (importPath.startsWith('../')) {
      const altPath = importPath.replace(/^\.\.\//, './');
      const altResolved = path.resolve(currentFileDir, altPath);
      console.log('Alternative attempt (../ -> ./):', altResolved);
      result = tryResolve(altResolved);
      if (result) return result;
      
      // Try also without prefix
      const noPrefixPath = importPath.replace(/^\.\.\//, '');
      const noPrefixResolved = path.resolve(currentFileDir, noPrefixPath);
      console.log('Alternative attempt (without ../):', noPrefixResolved);
      result = tryResolve(noPrefixResolved);
      if (result) return result;
    }
    
    console.log('✗ File not found for the relative path:', resolved);
  }

  // Handle imports with aliases
  // Sort aliases by decreasing length to match the longest first
  const sortedAliases = Object.keys(aliasMap).sort((a, b) => b.length - a.length);
  
  // Normalize the import for the matching
  let normalizedImport = importPath;
  // If the import starts with @ but not @/, normalize to @/
  if (normalizedImport.startsWith('@') && !normalizedImport.startsWith('@/')) {
    normalizedImport = normalizedImport.replace(/^@([^/])/, '@/$1');
  }
  
  for (const alias of sortedAliases) {
    // Normalize the alias: ensure it ends with / for a correct matching
    const normalizedAlias = alias.endsWith('/') ? alias : alias + '/';
    
    // Check if the import starts with the normalized alias
    if (normalizedImport.startsWith(normalizedAlias)) {
        // Extract the suffix after the alias (without the slash)
      const suffix = normalizedImport.slice(normalizedAlias.length);
      
      // Resolve the full path
      const resolved = path.resolve(aliasMap[alias], suffix);
      console.log(`Attempt with alias "${alias}" (normalized: "${normalizedAlias}")`);
      console.log(`  Import: "${importPath}" -> normalized: "${normalizedImport}"`);
      console.log(`  Suffix: "${suffix}"`);
      console.log(`  Resolved path: "${resolved}"`);
      
      // Check if the file exists as is
      if (fs.existsSync(resolved)) {
        console.log('✓ File found:', resolved);
        return resolved;
      }

      // If the resolved path already ends with .module.css/scss/sass, we're done
      if (resolved.endsWith('.module.css') || resolved.endsWith('.module.scss') || resolved.endsWith('.module.sass')) {
        console.log('✗ File not found (extension already present):', resolved);
        continue;
      }

      // Try with the .module.css extension
      const withCss = resolved + '.module.css';
      if (fs.existsSync(withCss)) {
        console.log('✓ File found with .module.css:', withCss);
        return withCss;
      }

      // Try with the .module.scss extension
      const withScss = resolved + '.module.scss';
      if (fs.existsSync(withScss)) {
        console.log('✓ File found with .module.scss:', withScss);
        return withScss;
      }

      // Try with the .module.sass extension
      const withSass = resolved + '.module.sass';
      if (fs.existsSync(withSass)) {
        console.log('✓ File found with .module.sass:', withSass);
        return withSass;
      }

      // Try index.module.css (if the directory is imported directly)
      const indexCss = path.join(resolved, 'index.module.css');
      if (fs.existsSync(indexCss)) {
        console.log('✓ File found: index.module.css:', indexCss);
        return indexCss;
      }
      
      console.log('✗ No variant found for:', resolved);
    }
  }

  console.log('No file found for:', importPath);
  return null;
}

function activate(context) {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('CSS Module Navigator requires an open workspace.');
    return;
  }
  
    console.log('📦 Workspace folders:', vscode.workspace.workspaceFolders.map(f => f.uri.fsPath));

  const disposable = vscode.commands.registerCommand('css-module-navigator.openCssModule', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const selection = editor.selection;
    const line = document.lineAt(selection.active.line).text;

    // Improved regex to capture different import formats (with or without 'from')
    const match = line.match(/import\s+(?:\w+\s+from\s+)?['"]([^'"]+\.module\.(css|scss|sass))['"]/);
    
    if (!match) {
      vscode.window.showInformationMessage('No CSS Module import found on this line.');
      return;
    }

    const importPath = match[1];
    const currentFileDir = path.dirname(document.fileName);
    
    // Find the workspace root that contains the current file
    let workspaceRoot = null;
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        if (document.fileName.startsWith(folder.uri.fsPath)) {
          workspaceRoot = folder.uri.fsPath;
          break;
        }
      }
      // If no workspace contains the file, use the first one
      if (!workspaceRoot) {
        workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
      }
    }
    
    console.log('📁 Used workspace root:', workspaceRoot);
    console.log('📄 Current file:', document.fileName);
    
    // Rebuild the alias map every time to be sure to have the latest configs
    // Pass the current file directory to search the config from there
    const aliasMap = getJsconfigPaths(currentFileDir, workspaceRoot);
    const resolvedPath = resolveImportPath(importPath, aliasMap, currentFileDir, workspaceRoot);

    if (!resolvedPath) {
      // Show more information for debugging
      const debugInfo = `Path not found for: ${importPath}\nCurrent directory: ${currentFileDir}\nAvailable aliases: ${Object.keys(aliasMap).join(', ')}`;
      vscode.window.showErrorMessage(debugInfo);
      console.error('Debug - Import path:', importPath);
      console.error('Debug - Current dir:', currentFileDir);
      console.error('Debug - Alias map:', aliasMap);
      return;
    }

    vscode.workspace.openTextDocument(resolvedPath).then(doc => {
      vscode.window.showTextDocument(doc);
    }, err => {
      vscode.window.showErrorMessage(`Unable to open file: ${err.message}`);
    });
  });

  context.subscriptions.push(disposable);
}
function deactivate() {}
module.exports = {
  activate,
  deactivate
};