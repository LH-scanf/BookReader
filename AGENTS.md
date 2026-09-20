# BookReader Agent Instructions

## Start here
For any non-trivial change, read `docs/README.md` first and then only the docs relevant to the task.

- Reader / EPUB / navigation: `CURRENT_STATE.md`, `ARCHITECTURE.md`, `MOBILE_V1.md`, `TESTING.md`
- Sync / OneDrive / notes: `CURRENT_STATE.md`, `ARCHITECTURE.md`, `DATA_SYNC.md`, `TESTING.md`
- Build / release: `CURRENT_STATE.md`, `DEPLOYMENT.md`, `TESTING.md`

Do not treat `docs/history/` as current behavior unless investigating history.

## Working rules
- Confirm root cause before editing.
- Fix the underlying behavior, not only the reproduction path.
- Preserve local-first behavior and Desktop/Mobile UI separation.
- Do not change sync/data semantics unless the task explicitly requires it.
- Add or update a regression test for the bug being fixed.
- Run the relevant existing tests before declaring completion.
- Update current docs only when behavior or project state actually changes.
