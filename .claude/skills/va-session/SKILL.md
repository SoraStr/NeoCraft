---
name: va-session
description: Resolve your current session ID for use with other VibeAround tools. Called by other skills that need session context (e.g. va-preview, vibearound handover).
---

# VibeAround Session ID

Resolve your current session ID. Other VibeAround skills reference this skill when they need session context for lifecycle management.

## How to Resolve

### Method 1: Via VibeAround env vars (preferred)

Check if the environment variables `VIBEAROUND_CHANNEL_KIND` and `VIBEAROUND_CHAT_ID` are set. If yes, call the `get_session_id` MCP tool:

```
Tool: get_session_id
Server: vibearound
Arguments:
  channel_kind: "<value of $VIBEAROUND_CHANNEL_KIND>"
  chat_id: "<value of $VIBEAROUND_CHAT_ID>"
```

The tool returns the exact session ID from VibeAround's internal state.

### Method 2: Fallback — agent-specific session files

If the env vars are not set (running outside VibeAround), resolve from your agent's local session metadata:

- **Claude Code**: Read `~/.claude/history.jsonl`, find the last entry whose `project` matches cwd, extract `sessionId`.
- **Codex**: Read `~/.codex/history.jsonl`, take last line, extract `session_id`.
- **Gemini**: Check recent sessions with `/resume`.
- **Other agents**: Omit — the server will attempt auto-discovery.

## Return Value

Return the session ID string to the calling skill. If neither method succeeds, return nothing — callers handle the missing case gracefully.
