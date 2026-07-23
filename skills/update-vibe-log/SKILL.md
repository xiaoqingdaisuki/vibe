---
name: update-vibe-log
description: Reconcile Vibe's daily Git commit log with src/content/blog/vibe-log.mdx. Use when asked to update the Vibe log, add commits missing from the daily log, or check whether Git history and vibe-log.mdx are in sync.
---

# Update Vibe Log

Synchronize the commit entries in `src/content/blog/vibe-log.mdx` with the repository Git history. The bundled script reads both files as UTF-8, adds only unlogged commit subjects, and groups additions by the commit's local author date.

## Workflow

1. Work from the Vibe repository root. Inspect the working tree first; do not overwrite unrelated user edits.
2. Run a preview:

   ```powershell
   node "$env:USERPROFILE\.codex\skills\update-vibe-log\scripts\sync-vibe-log.mjs" --check
   ```

   Use `--repo <path>` or `--file <path>` only when the repository or log file is not the default.

3. If the preview reports missing entries, update the log:

   ```powershell
   node "$env:USERPROFILE\.codex\skills\update-vibe-log\scripts\sync-vibe-log.mjs" --write
   ```

4. Review the diff. Preserve the existing YAML frontmatter and keep `pinned: true`. The script updates `updated` to the newest newly recorded commit date.
5. Verify text with a UTF-8-aware reader and scan changed Chinese source for mojibake. Do not alter commit subjects: record each original Git subject verbatim.

## Matching and Ordering

- Compare entries by exact date and exact commit subject; repeated subjects are counted, so distinct commits with the same subject are retained.
- Add missing subjects newest first within their date group.
- Create missing date groups in descending date order.
- Leave existing entries untouched. If the log contains manually written entries or a subject was edited, resolve that discrepancy manually before rerunning with `--write`.

## Safety

- Run `--check` before `--write`.
- Do not use `--write` if the file has a merge conflict, malformed frontmatter, or malformed date headings; fix the document first.
- The script intentionally considers commits reachable from all local refs. Pass `--head` to limit the source to the current `HEAD` history.
