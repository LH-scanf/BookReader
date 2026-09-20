# Reader-specific Instructions

Before changing Reader behavior, inspect every affected navigation path:

- initial open
- saved CFI / progress resume
- TOC navigation
- search / annotation preview
- return to reading

Keep these invariants:

- Mobile uses the proven `scrolled-doc` path; do not switch it to continuous manager without explicit approval.
- Normal reading navigation and exact preview navigation are different semantics.
- Ordinary progress / CFI / chapter updates must not rebuild the whole Reader.
- Transient relocation during restore/normalization must not overwrite real progress.
- Reader fixes must not regress Desktop pagination, keyboard navigation, TOC, selection/highlights, or resume.

When a bug can affect multiple entry paths, one-path tests are not sufficient.
