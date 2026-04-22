---
name: cancel
description: Cancel active execution modes
---

# Cancel Skill

Cleanly exit active modes and cleanup state.

## Use When

- Work is done and verified
- User says "stop", "cancel", "abort"
- Need to switch modes

## Actions

1. Mark current mode as inactive
2. Write completion timestamp
3. Clear temporary state
4. Report status

## Usage

```
$cancel
```

Or CLI:
```
omk cancel
```
