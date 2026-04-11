---
name: ralph-init
description: Initialize Ralph mode with context snapshot
---

# Ralph Init Skill

Quick initialization for Ralph persistence mode with context.

## Use When

- Starting Ralph quickly
- Pre-configured Ralph sessions
- Ralph with specific context

## Quick Start

```
$ralph-init "task description"
```

Equivalent to:
```
$ralph --quick "task description"
```

## With Options

```
$ralph-init "fix auth" --context=bug-fix
$ralph-init "implement feature" --prd=feature.md
$ralph-init "cleanup" --no-verify
```

## Context Presets

### Bug Fix
```
$ralph-init "fix" --preset=bugfix
```

### Feature
```
$ralph-init "build" --preset=feature
```

### Refactor
```
$ralph-init "refactor" --preset=cleanup
```

## Auto-Configuration

Ralph-init automatically:
1. Creates context snapshot
2. Sets iteration limit
3. Configures verification
4. Initializes state

## Comparison

| Command | Use Case |
|---------|----------|
| `$ralph` | Full control |
| `$ralph-init` | Quick start |
| `$ralplan` | Plan first |

## Usage

```
$ralph-init "optimize database queries"
$ralph-init --resume              # Continue last
$ralph-init --list                # Show presets
```
