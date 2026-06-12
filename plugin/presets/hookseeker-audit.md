---
id: hookseeker-audit
label: Hookseeker Audit
mode: cc
order: 1
tools:
  - Read
  - Glob
  - Grep
  - LS
contextFiles:
  - cnz-layout.md
---
Perform a hookseeker audit of the Canonize extension.
Check the following:
1. Confirm the hookseeker output fields are present in recent chat messages
2. Confirm anchor data is correctly embedded in the expected metadata fields
3. Check for any missing or malformed chunk headers in lorebook entries
4. Report any anomalies clearly with file paths and line references

Use the workspace map and CNZ layout context to locate the relevant files.
Be thorough but concise in your findings.
