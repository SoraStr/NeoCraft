# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

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
