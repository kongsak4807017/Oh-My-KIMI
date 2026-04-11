---
name: plan
description: Create implementation plan with tradeoff analysis
---

# Plan Skill

Create structured implementation plans with architecture decisions.

## Use When

- Requirements are clear but implementation path is uncertain
- Need to review tradeoffs before execution
- Want consensus on approach

## Output

Creates in `.omk/plans/`:
- `plan-{slug}.md` - Implementation plan
- `prd-{slug}.md` - Product requirements (if applicable)

## Structure

1. **Overview** - What we're building
2. **Goals** - Success criteria
3. **Non-goals** - What's out of scope
4. **Approach** - Technical strategy
5. **Tradeoffs** - Options considered
6. **Tasks** - Breakdown of work
7. **Verification** - How we'll test

## Usage

```
$plan "build a REST API for user management"
```
