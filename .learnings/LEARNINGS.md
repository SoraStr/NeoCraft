# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---
## [LRN-20260610-001] correction

**Logged**: 2026-06-10T01:09:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
Import progress must cover pre-copy detection, and rebuild verification must include the daemon binary actually used at runtime.

### Details
The custom import UI still showed 0.0 MB because the daemon could be blocked before copy progress: first in directory/JAR detection, then potentially in single-file copy. Also, frontend/server rebuilds do not update an already-running or release-packaged daemon binary unless the top-level build or daemon build is run and the daemon process is restarted.

### Suggested Action
For daemon-backed workflows, expose progress/status for each stage and confirm timestamps/paths for the runtime daemon binary (`target/debug`, `target/release`, or `build/neocraft-daemon`) before asking the user to retry.

### Metadata
- Source: user_feedback
- Related Files: daemon/src/instance.rs, daemon/src/detect.rs, daemon/src/files.rs, frontend/src/pages/Setup.tsx
- Tags: import-flow, daemon-runtime, progress

---
## [LRN-20260609-002] correction

**Logged**: 2026-06-09T23:33:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
Do not treat one plausible import timeout cause as the confirmed root cause without matching the user's selected path.

### Details
The user clarified that their custom import source was not NeoCraft's data directory or a parent directory. The initial fix covered a real recursive-copy hazard, but did not explain the reported normal-directory timeout. The import flow also needed progress for long directory copies and a longer import timeout.

### Suggested Action
When fixing timeout-style bugs, preserve any hardening found during investigation but continue until the reported scenario is covered by code and tests.

### Metadata
- Source: user_feedback
- Related Files: daemon/src/instance.rs, daemon/src/files.rs, frontend/src/pages/Setup.tsx
- Tags: import-flow, timeout, root-cause

---
## [LRN-20260609-001] correction

**Logged**: 2026-06-09T21:33:30+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
A market "one-click install" must not render a normal download link for installable versions.

### Details
The user reported that clicking the market version action downloaded the JAR in the browser. The UI branch used `href={version.downloadUrl}` when `installable` was false or missing, which made ordinary direct-download versions behave as browser downloads instead of calling the backend install endpoint.

### Suggested Action
For plugin market installs, render a button that calls the backend install endpoint for all non-external versions. Reserve anchor links only for explicitly external/manual-download versions.

### Metadata
- Source: user_feedback
- Related Files: frontend/src/components/management/ModsTab.tsx
- Tags: plugin-market, install-flow, frontend

---
