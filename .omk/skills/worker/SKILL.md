---
name: worker
description: Team worker protocol and lifecycle
---

# Worker Skill

Worker protocol for team mode execution.

## Use When

- Running as team worker
- Inside team mode
- Worker-specific tasks

## Worker Protocol

### Lifecycle
1. **ACK** - Acknowledge task receipt
2. **EXECUTE** - Perform work
3. **REPORT** - Send results
4. **COMMIT** - Commit changes

### Communication

Workers communicate via:
- Inbox: `workers/{id}/inbox.md`
- Mailbox: `mailbox/worker-{id}.json`
- Leader: `mailbox/leader.json`

## Commands

### Acknowledge
```
$worker ack
```

### Report Status
```
$worker status "in_progress"
$worker status "completed"
$worker status "blocked: reason"
```

### Submit Results
```
$worker submit "results summary"
$worker submit --files=changed.txt
```

### Request Help
```
$worker escalate "need clarification"
```

## Responsibilities

- Execute assigned tasks
- Stay in scope
- Report blockers
- Commit changes
- Follow team conventions

## State Machine

```
IDLE -> ASSIGNED -> WORKING -> REVIEW -> DONE
  ↑                                    |
  └────────── BLOCKED ←───────────────┘
```

## Environment Variables

```bash
OMK_TEAM_WORKER=team-1/worker-1
OMK_TEAM_STATE_ROOT=./.omk/state
OMK_TEAM_LEADER_CWD=/project
```

## Usage

```
# Inside team worker pane
$worker ack
$worker status "working on task"
# ... do work ...
$worker submit "completed"
```

## Note

This skill runs automatically in team mode.
Manual use for debugging/testing only.
