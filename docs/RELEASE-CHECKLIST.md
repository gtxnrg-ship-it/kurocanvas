# Kuro Canvas Release Checklist

Do not mark an item complete without evidence from CI or a reproducible manual test. Link the workflow run or test report in the release notes.

## Repository and build
- [ ] PR state/conflicts reviewed; no unintended changes are missing from `main`.
- [ ] Dependency installation succeeds from a clean checkout.
- [ ] TypeScript/type checks pass where configured.
- [ ] Production build passes.
- [ ] Automated unit/integration tests pass.
- [ ] No secrets or local credentials are committed.
- [ ] Relevant GitHub Actions runs are successful.

## Drawing
- [ ] Brush, eraser, pointer/stylus input work.
- [ ] Undo/redo preserves the correct history.
- [ ] Layer selection, visibility, lock and ordering work.
- [ ] Opacity/blend modes render and export correctly.
- [ ] Erasing one layer does not affect another.
- [ ] Pan/zoom, transforms and large-canvas performance tested where supported.
- [ ] PNG export has the expected visible layers and dimensions.

## Persistence and packages
- [ ] Autosave and reload recovery work.
- [ ] Switching, renaming, creating and deleting drawings does not cross-contaminate data.
- [ ] Project and drawing data remain linked correctly.
- [ ] Import validates before modifying existing data.
- [ ] Export/import round-trip preserves supported content.
- [ ] Corrupt, oversized and unsupported-version packages fail safely.
- [ ] Backup and restore are tested.

## AI provider and tools
- [ ] Valid and invalid provider configuration tested.
- [ ] Timeout, cancellation, offline endpoint, rate limit and malformed response handled.
- [ ] Provider capabilities are accurately represented.
- [ ] Credentials do not appear in logs, exports or source.
- [ ] Invalid model-generated commands are rejected.
- [ ] Approval applies to the exact plan/action reviewed.
- [ ] Cancellation prevents queued work from continuing.
- [ ] Action timeline matches actual tool results.
- [ ] Undo/checkpoint restores state without deleting unrelated work.

## Universe memory and chapter workflow
- [ ] Project isolation and memory provenance tested.
- [ ] Unknown facts are not treated as false.
- [ ] Character knowledge and world truth remain separate.
- [ ] Contradictions and retcons are surfaced for approval.
- [ ] Outline and panel plan reference relevant canon.
- [ ] Native stick-figure thumbnail actions visibly modify the canvas.
- [ ] User can pause, revise, approve and undo.
- [ ] Closing/reopening restores canon, plan, artwork and action progress.

## Comics and exports
- [ ] Panel order, gutters, reading direction and lettering verified.
- [ ] Long-strip virtualization and export splitting tested.
- [ ] PDF/CBZ and image exports open and preserve order.
- [ ] Output dimensions and platform-specific limits validated.

## Device and accessibility
- [ ] Supported browser/desktop/mobile targets tested.
- [ ] Touch and stylus behavior tested on actual supported devices.
- [ ] Offline drawing works without a configured model.
- [ ] Low-memory behavior and recovery tested.
- [ ] Keyboard/accessibility basics checked.

## Release notes
- [ ] List verified features and known limitations honestly.
- [ ] Include migration/backup notes if data formats changed.
- [ ] Link source commit, PRs and CI results.
- [ ] Do not label untested or placeholder features as complete.
