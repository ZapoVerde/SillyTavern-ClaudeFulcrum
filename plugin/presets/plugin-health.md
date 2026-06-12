---
id: plugin-health
label: Plugin Health Check
mode: cc
order: 2
tools:
  - Read
  - Glob
  - LS
contextFiles:
  - st-layout.md
  - plugins-layout.md
---
Perform a health check on the SillyTavern plugin installation.
Check the following:
1. Confirm all plugins in the plugins directory have valid index.js files
2. Confirm plugin symlinks in st-plugins resolve correctly
3. Check that each plugin exports the required info/init/exit interface
4. Note any plugins that appear broken, missing dependencies, or misconfigured

Report findings with specific file paths.
