# CSS Module Navigator

A VS Code extension that allows you to quickly navigate to CSS Module files from imports in your JavaScript/TypeScript code.

## Features

- 🚀 Quick navigation to CSS Module files
- 📁 Support for relative imports (`./`, `../`)
- 🎯 Support for path aliases (via `jsconfig.json` or `tsconfig.json`)
- 🎨 Support for multiple extensions: `.module.css`, `.module.scss`, `.module.sass`
- ⌨️ Keyboard shortcut: `Ctrl+Alt+C` (or `Cmd+Alt+C` on Mac)

## Usage

### Method 1: Keyboard Shortcut
1. Place your cursor on a line containing a CSS Module import
2. Press `Ctrl+Alt+C` (or `Cmd+Alt+C` on Mac)

### Method 2: Context Menu
1. Right-click on a line with a CSS Module import
2. Select "Open CSS Module File"

### Method 3: Command Palette
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "Open CSS Module File"
3. Press Enter

## Supported Import Examples

```javascript
// Relative import
import styles from './Button.module.css';
import styles from '../styles/global.module.css';

// Import with alias (requires jsconfig.json or tsconfig.json)
import styles from '@/styles/global.module.css';
import styles from '@components/Button.module.css';

// Different extensions
import styles from './styles.module.scss';
import styles from './styles.module.sass';
```

## Configuration

The extension automatically uses your `jsconfig.json` or `tsconfig.json` to resolve path aliases.

Example `jsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"]
    }
  }
}
```

The extension will automatically search for configuration files in subdirectories, so it works even if your project is nested within a workspace.

## Requirements

- VS Code version 1.100.0 or higher

## Release Notes

### 0.0.1

Initial release with support for relative imports and path aliases.



If you find this useful, consider leaving a ⭐ on the Marketplace
