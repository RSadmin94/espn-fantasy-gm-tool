# PowerShell only

This project’s handoff and the machine this bundle was built on assume **Windows PowerShell**, not bash/sh.

## Rules for agents

- Use **PowerShell** syntax: `;` to chain commands, `$env:VAR` for environment variables, `Get-ChildItem` / `Copy-Item` / `Compress-Archive`, etc.
- Do **not** assume `&&` works (older Windows PowerShell); prefer separate lines or `; if ($?) { ... }`.
- Paths may contain spaces; quote paths: `"C:\path with spaces\repo"`.
- For `git` on Windows, same rules apply; use `git status` on its own line if chaining is unreliable.

## Recreating this bundle (example)

From the repo root (adjust drive/path):

```powershell
Set-Location "C:\path\to\espn-fantasy-gm-tool"
# … create qwen_takeover_bundle and copies …
Compress-Archive -Path ".\qwen_takeover_bundle" -DestinationPath ".\qwen_takeover_bundle.zip" -Force
```

## If you must use bash

Only if the **project’s documented CI** or maintainer explicitly requires WSL/bash. Default remains PowerShell for this handoff.
