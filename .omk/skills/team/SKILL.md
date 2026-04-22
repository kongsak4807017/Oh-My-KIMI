---
name: team
description: Coordinated multi-agent execution
---

# Team Skill

Team mode for parallel execution across multiple agents.

## Use When

- Task has multiple independent lanes
- Need coordinated parallel execution
- Work is large enough to justify coordination overhead

## Workflow

1. Parse task and identify parallelizable subtasks
2. Create task assignments for each agent
3. Delegate to agents simultaneously
4. Monitor progress
5. Integrate results
6. Verify final output

## State

```json
{
  "mode": "team",
  "active": true,
  "tasks": [],
  "agents": []
}
```

## Commands

- `$team "task description"` - Start team execution
- Use multiple agents for different aspects:
  - Implementation agent
  - Test/verification agent
  - Review agent
