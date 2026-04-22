---
name: hud
description: Heads-up display for status monitoring
---

# HUD Skill

Status monitoring and heads-up display for OMK.

## Use When

- Monitor active tasks
- Track team progress
- View system status
- "hud", "status", "monitor"

## Display Elements

### Mode Status
- Active skills
- Current phase
- Iteration count
- Time elapsed

### Team Status
- Worker states
- Task queue
- Messages
- Health indicators

### System Status
- API rate limits
- Token usage
- Memory usage
- Network status

## Usage

```
$hud              # Show current status
$hud --watch      # Live updating display
$hud --json       # JSON output
$hud --preset=minimal
$hud --preset=full
```

## In Tmux

HUD works best in tmux:
```
# Auto-attach HUD pane
omk --hud

# Dedicated HUD window
$hud --window
```

## Customization

Configure in `.omk/config.json`:
```json
{
  "hud": {
    "refreshRate": 5000,
    "elements": ["modes", "tasks", "system"],
    "theme": "dark"
  }
}
```

## Watch Mode

```
$hud --watch --interval=10
```

Updates every 10 seconds. Press 'q' to quit.
