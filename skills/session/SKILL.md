---
name: session
description: Manage OMK sessions (save, load, list, resume)
---

# Session Skill

Manage OMK chat sessions - save, load, list, and resume.

## Use When

- "session", "save chat", "resume"
- Continue work later
- Switch between contexts
- Archive conversations

## Commands

### Save Session
```
$session save
$session save my-feature
$session save --name=bugfix-123
```

### Load Session
```
$session load my-feature
$session resume           # Load last
```

### List Sessions
```
$session list
$session list --all
$session list --today
```

### Delete Session
```
$session delete old-session
$session clean --older-than=30d
```

## Session Data

Saved to `.omk/sessions/{name}.json`:
- Chat history
- Context files
- Mode state
- Tasks
- Notes

## Auto-Save

Enable auto-save:
```
$session autosave on
$session autosave --interval=5m
```

## Session Types

### Feature Sessions
Long-running feature work:
```
$session start feature/new-auth
```

### Bug Fix Sessions
Focused debugging:
```
$session start bugfix/login-error
```

### Exploration Sessions
Research and exploration:
```
$session start explore/graphql
```

## Sharing

Export session:
```
$session export my-session --format=md
$session export --gist
```

## Usage

```
$session save "current work"
# ... later ...
$session resume
```

## Integration

Sessions integrate with:
- REPL history
- Mode state
- Tasks
- Notepad

## Default Sessions

- `default`: Default session
- `last`: Most recent
- `backup`: Auto-backup
