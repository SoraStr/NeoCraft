# Errors

Command failures and integration errors.

---

## [ERR-20260609-002] cargo-test-filter

**Logged**: 2026-06-09T11:56:00+08:00
**Priority**: low
**Status**: pending
**Area**: tests

### Summary
Used an unsupported multi-filter form while verifying NeoCraft changes.

### Error
`cargo test name1 name2` failed because Cargo accepts a single test-name filter before `--`.

### Context
- Attempted to run two daemon test filters in one Cargo command after a port-default change.
- Correct project command is `cd daemon && cargo test`, or one Cargo filter at a time.

### Suggested Fix
Use the package scripts directly unless the project has documented runner-specific flags.

### Metadata
- Reproducible: yes
- Related Files: daemon/Cargo.toml

---
## [ERR-20260609-001] vitest-cli-option

**Logged**: 2026-06-09T11:16:20+08:00
**Priority**: low
**Status**: pending
**Area**: tests

### Summary
Used Jest's `--runInBand` flag with Vitest, which Vitest rejects.

### Error
```
CACError: Unknown option `--runInBand`
```

### Context
- Command attempted: `npm test -- --runInBand ...` in the server package.
- Correct approach used afterward: pass file paths directly to `vitest run`, e.g. `npm test -- tests/services/plugin-market-service.test.ts`.

### Suggested Fix
Use Vitest-native flags or file filters instead of Jest CLI options.

### Metadata
- Reproducible: yes
- Related Files: server/package.json

---
