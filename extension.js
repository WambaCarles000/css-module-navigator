const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function findConfigFile(startDir, workspaceRoot) {
  // Remonte depuis le répertoire du fichier jusqu'à la racine du workspace
  let currentDir = startDir;
  const rootPath = path.resolve(workspaceRoot);
  
  while (currentDir && currentDir !== path.dirname(currentDir)) {
    // Vérifie si on a dépassé la racine du workspace
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
    
    // Remonte d'un niveau
    currentDir = path.dirname(currentDir);
  }
  
  return null;
}

function getJsconfigPaths(startDir, workspaceRoot) {
  console.log('🔍 Recherche de jsconfig/tsconfig depuis:', startDir);
  console.log('   Workspace root:', workspaceRoot);
  
  const configResult = findConfigFile(startDir, workspaceRoot);
  
  if (!configResult) {
    console.log('⚠️ Aucun fichier de configuration trouvé');
    return {};
  }
  
  const { configPath, projectRoot } = configResult;
  console.log(`  ✓ Fichier trouvé: ${configPath}`);
  console.log(`  📁 Racine du projet: ${projectRoot}`);
  
  try {
    let raw = fs.readFileSync(configPath, 'utf8');
    
    // Nettoie le JSON : retire les virgules traînantes et les commentaires
    // Retire les commentaires de ligne (// ...)
    raw = raw.replace(/\/\/.*$/gm, '');
    // Retire les commentaires de bloc (/* ... */)
    raw = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    // Retire les virgules traînantes dans les objets et tableaux
    raw = raw.replace(/,(\s*[}\]])/g, '$1');
    
    const config = JSON.parse(raw);
    
    const compilerOptions = config.compilerOptions || {};
    const baseUrl = compilerOptions.baseUrl || '.';
    const paths = compilerOptions.paths || {};
    
    console.log('  baseUrl:', baseUrl);
    console.log('  paths:', paths);
    
    if (Object.keys(paths).length === 0) {
      console.log('  ⚠️ Aucun path trouvé dans compilerOptions.paths');
      return {};
    }
    
    const resolvedPaths = {};

    for (const alias in paths) {
      // Nettoie l'alias : retire le * à la fin
      let cleanAlias = alias.replace(/\*$/, '');
      
      // Nettoie la cible : retire le * à la fin
      const target = paths[alias][0].replace(/\*$/, '');
      const resolvedTarget = path.resolve(projectRoot, baseUrl, target);
      
      console.log(`  Alias: "${alias}" -> "${cleanAlias}" -> "${resolvedTarget}"`);
      
      // Stocke l'alias tel quel (sans slash) - la normalisation se fera lors du matching
      resolvedPaths[cleanAlias] = resolvedTarget;
      
      // Stocke aussi avec slash si l'alias n'en a pas déjà un
      // Cela permet de matcher à la fois "@/styles" et "@/styles/"
      if (!cleanAlias.endsWith('/')) {
        resolvedPaths[cleanAlias + '/'] = resolvedTarget;
      }
    }

    console.log('✅ Alias résolus:', resolvedPaths);
    return resolvedPaths;
  } catch (err) {
    console.error(`❌ Erreur lecture ${path.basename(configPath)}:`, err);
    console.error('  Stack:', err.stack);
    return {};
  }
}

function resolveImportPath(importPath, aliasMap, currentFileDir, _workspaceRoot) {
  console.log('Résolution du chemin:', importPath);
  console.log('Répertoire courant:', currentFileDir);
  
  // Gère les imports relatifs (./ ou ../)
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const resolved = path.resolve(currentFileDir, importPath);
    console.log('Chemin résolu (relatif):', resolved);
    
    // Fonction helper pour tester un chemin
    const tryResolve = (basePath) => {
      // Si le chemin contient déjà .module.css, vérifie directement
      if (importPath.includes('.module.')) {
        if (fs.existsSync(basePath)) {
          console.log('✓ Fichier trouvé:', basePath);
          return basePath;
        }
        
        // Essaie différentes extensions
        const extensions = ['.css', '.scss', '.sass'];
        for (const ext of extensions) {
          const withExt = basePath.replace(/\.(css|scss|sass)$/, ext);
          if (fs.existsSync(withExt)) {
            console.log('✓ Fichier trouvé avec extension:', withExt);
            return withExt;
          }
        }
      } else {
        // Si pas d'extension, essaie avec .module.css
        const withCss = basePath + '.module.css';
        if (fs.existsSync(withCss)) {
          console.log('✓ Fichier trouvé:', withCss);
          return withCss;
        }
        
        const withScss = basePath + '.module.scss';
        if (fs.existsSync(withScss)) {
          console.log('✓ Fichier trouvé:', withScss);
          return withScss;
        }
        
        const withSass = basePath + '.module.sass';
        if (fs.existsSync(withSass)) {
          console.log('✓ Fichier trouvé:', withSass);
          return withSass;
        }
        
        // Essaie index.module.css dans le dossier
        const indexCss = path.join(basePath, 'index.module.css');
        if (fs.existsSync(indexCss)) {
          console.log('✓ Fichier trouvé:', indexCss);
          return indexCss;
        }
      }
      return null;
    };
    
    // Essaie d'abord le chemin résolu tel quel
    let result = tryResolve(resolved);
    if (result) return result;
    
    // Si ça ne fonctionne pas et que le chemin commence par ../, essaie aussi avec ./
    if (importPath.startsWith('../')) {
      const altPath = importPath.replace(/^\.\.\//, './');
      const altResolved = path.resolve(currentFileDir, altPath);
      console.log('Tentative alternative (../ -> ./):', altResolved);
      result = tryResolve(altResolved);
      if (result) return result;
      
      // Essaie aussi sans préfixe
      const noPrefixPath = importPath.replace(/^\.\.\//, '');
      const noPrefixResolved = path.resolve(currentFileDir, noPrefixPath);
      console.log('Tentative alternative (sans ../):', noPrefixResolved);
      result = tryResolve(noPrefixResolved);
      if (result) return result;
    }
    
    console.log('✗ Fichier non trouvé pour le chemin relatif:', resolved);
  }

  // Gère les imports avec alias
  // Trie les alias par longueur décroissante pour matcher le plus long d'abord
  const sortedAliases = Object.keys(aliasMap).sort((a, b) => b.length - a.length);
  
  // Normalise l'import pour le matching
  let normalizedImport = importPath;
  // Si l'import commence par @ mais pas @/, normalise vers @/
  if (normalizedImport.startsWith('@') && !normalizedImport.startsWith('@/')) {
    normalizedImport = normalizedImport.replace(/^@([^/])/, '@/$1');
  }
  
  for (const alias of sortedAliases) {
    // Normalise l'alias : s'assure qu'il se termine par / pour un matching correct
    const normalizedAlias = alias.endsWith('/') ? alias : alias + '/';
    
    // Vérifie si l'import commence par l'alias normalisé
    if (normalizedImport.startsWith(normalizedAlias)) {
      // Extrait le suffixe après l'alias (sans le slash)
      const suffix = normalizedImport.slice(normalizedAlias.length);
      
      // Résout le chemin complet
      const resolved = path.resolve(aliasMap[alias], suffix);
      console.log(`Tentative avec alias "${alias}" (normalisé: "${normalizedAlias}")`);
      console.log(`  Import: "${importPath}" -> normalisé: "${normalizedImport}"`);
      console.log(`  Suffixe: "${suffix}"`);
      console.log(`  Chemin résolu: "${resolved}"`);
      
      // Vérifie si le fichier existe tel quel
      if (fs.existsSync(resolved)) {
        console.log('✓ Fichier trouvé:', resolved);
        return resolved;
      }

      // Si le chemin résolu se termine déjà par .module.css/scss/sass, on a fini
      if (resolved.endsWith('.module.css') || resolved.endsWith('.module.scss') || resolved.endsWith('.module.sass')) {
        console.log('✗ Fichier non trouvé (extension déjà présente):', resolved);
        continue;
      }

      // Essaie avec l'extension .module.css
      const withCss = resolved + '.module.css';
      if (fs.existsSync(withCss)) {
        console.log('✓ Fichier trouvé avec .module.css:', withCss);
        return withCss;
      }

      // Essaie avec .module.scss
      const withScss = resolved + '.module.scss';
      if (fs.existsSync(withScss)) {
        console.log('✓ Fichier trouvé avec .module.scss:', withScss);
        return withScss;
      }

      // Essaie avec .module.sass
      const withSass = resolved + '.module.sass';
      if (fs.existsSync(withSass)) {
        console.log('✓ Fichier trouvé avec .module.sass:', withSass);
        return withSass;
      }

      // Essaie index.module.css (si le dossier est importé directement)
      const indexCss = path.join(resolved, 'index.module.css');
      if (fs.existsSync(indexCss)) {
        console.log('✓ Fichier trouvé: index.module.css:', indexCss);
        return indexCss;
      }
      
      console.log('✗ Aucune variante trouvée pour:', resolved);
    }
  }

  console.log('Aucun fichier trouvé pour:', importPath);
  return null;
}

function activate(context) {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('CSS Module Navigator nécessite un workspace ouvert.');
    return;
  }
  
  console.log('📦 Workspace folders:', vscode.workspace.workspaceFolders.map(f => f.uri.fsPath));

  const disposable = vscode.commands.registerCommand('css-module-navigator.openCssModule', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const selection = editor.selection;
    const line = document.lineAt(selection.active.line).text;

    // Regex améliorée pour capturer différents formats d'import (avec ou sans 'from')
    const match = line.match(/import\s+(?:\w+\s+from\s+)?['"]([^'"]+\.module\.(css|scss|sass))['"]/);
    
    if (!match) {
      vscode.window.showInformationMessage('Aucun import CSS Module trouvé sur cette ligne.');
      return;
    }

    const importPath = match[1];
    const currentFileDir = path.dirname(document.fileName);
    
    // Trouve le workspace root qui contient le fichier actuel
    let workspaceRoot = null;
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        if (document.fileName.startsWith(folder.uri.fsPath)) {
          workspaceRoot = folder.uri.fsPath;
          break;
        }
      }
      // Si aucun workspace ne contient le fichier, utilise le premier
      if (!workspaceRoot) {
        workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
      }
    }
    
    console.log('📁 Workspace root utilisé:', workspaceRoot);
    console.log('📄 Fichier actuel:', document.fileName);
    
    // Reconstruit l'alias map à chaque fois pour être sûr d'avoir les dernières configs
    // Passe le répertoire du fichier actuel pour chercher le config depuis là
    const aliasMap = getJsconfigPaths(currentFileDir, workspaceRoot);
    const resolvedPath = resolveImportPath(importPath, aliasMap, currentFileDir, workspaceRoot);

    if (!resolvedPath) {
      // Affiche plus d'informations pour le debug
      const debugInfo = `Chemin introuvable pour : ${importPath}\nRépertoire courant: ${currentFileDir}\nAlias disponibles: ${Object.keys(aliasMap).join(', ')}`;
      vscode.window.showErrorMessage(debugInfo);
      console.error('Debug - Import path:', importPath);
      console.error('Debug - Current dir:', currentFileDir);
      console.error('Debug - Alias map:', aliasMap);
      return;
    }

    vscode.workspace.openTextDocument(resolvedPath).then(doc => {
      vscode.window.showTextDocument(doc);
    }, err => {
      vscode.window.showErrorMessage(`Impossible d'ouvrir le fichier : ${err.message}`);
    });
  });

  context.subscriptions.push(disposable);
}
function deactivate() {}
module.exports = {
  activate,
  deactivate
};
