---
name: autopilot
description: Full autonomous pipeline from idea to code
---

# Autopilot Skill

Complete autonomous pipeline: plan → execute → verify.

## Use When

- User wants something built without manual steps
- Clear enough to start, trust agent to figure out details
- "Build me a...", "I want a...", "autopilot"

## Pipeline

1. **Understand** - Parse request, ask minimal clarifying questions
2. **Plan** - Create implementation plan
3. **Execute** - Implement the solution
4. **Verify** - Test and validate
5. **Deliver** - Present final result

## Usage

```
$autopilot "create a CLI tool that converts JSON to YAML"
```

## Notes

- Makes reasonable assumptions
- Asks only for critical decisions
- Provides full working solution
