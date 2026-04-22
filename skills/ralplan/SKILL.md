---
name: ralplan
description: Consensus planning before Ralph execution
---

# Ralplan Skill

Plan-driven workflow: Plan first, then execute with Ralph.

## Use When

- Complex tasks need planning
- Architecture decisions
- Tradeoff analysis
- "ralplan", "consensus plan", "plan then execute"

## Workflow

### Phase 1: Planning
```
$ralplan "implement caching layer"
```

Creates:
- `.omk/plans/ralplan-{slug}.md`
- Architecture options
- Tradeoff analysis
- Implementation plan

### Phase 2: Deliberation
Review and approve plan:
- Options considered
- Decision rationale
- Risk assessment
- Test strategy

### Phase 3: Execution
Auto-starts Ralph with approved plan:
```
# After plan approval
$ralph --plan=ralplan-{slug}
```

## Features

### Structured Deliberation
```
$ralplan --deliberate "high-risk change"
```

Deeper analysis for critical decisions.

### Option Comparison
```
$ralplan --options=3 "database choice"
```

Compares 3 implementation approaches.

### Consensus Gate
Plan must be explicitly approved before Ralph starts.

## Usage

```
$ralplan "new authentication system"
$ralplan --quick "simple feature"    # Fast track
$ralplan --resume                    # Continue planning
```

## Output Artifacts

- `plan-*.md`: Implementation plan
- `test-spec-*.md`: Test specifications
- `decisions-*.md`: Decision log
