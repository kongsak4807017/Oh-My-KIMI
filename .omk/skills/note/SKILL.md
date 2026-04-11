---
name: note
description: Quick note taking for session context
---

# Note Skill

Quick note taking to preserve context across sessions.

## Use When

- "note", "remember", "jot"
- Save important info
- Cross-session memory
- Quick reminders

## Commands

### Add Note
```
$note "important decision about auth"
$note --tag=decision "use JWT"
```

### View Notes
```
$note --list          # All notes
$note --last          # Most recent
$note --tag=decision  # Filter by tag
```

### Search Notes
```
$note --search "auth"
$note --grep "TODO"
```

## Storage

Notes saved to `.omk/notepad.md`:
```markdown
## 2024-01-15T10:30:00Z [decision]
use JWT for auth

## 2024-01-15T11:00:00Z
remember to update docs
```

## Integration

Notes automatically:
- Loaded in new sessions
- Included in context
- Searchable

## Usage Examples

```
$note "API key expires next week"
$note --tag=urgent "fix security issue"
$note --list
```

## Persistent Memory

Notes survive:
- Session restarts
- Mode switches
- System reboots
