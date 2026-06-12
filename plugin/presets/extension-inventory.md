---
id: extension-inventory
label: Extension Inventory
mode: cc
order: 3
tools:
  - Read
  - Glob
  - LS
contextFiles:
  - extensions-layout.md
---
List all installed SillyTavern extensions and their status.
For each extension:
1. Name and version from manifest.json
2. Whether it has a server-side plugin component
3. Any obvious issues (missing files, broken manifest)

Format as a clean inventory table.
