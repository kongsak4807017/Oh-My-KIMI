---
name: ralph
description: Self-referential loop until task completion with verification
---

# Ralph Skill

Ralph is a persistence loop that keeps working on a task until it is fully complete and verified.

## Use When

- Task requires guaranteed completion with verification
- User says "ralph", "don't stop", "must complete", "finish this"
- Work may span multiple iterations and needs persistence

## Steps

1. **Review progress**: Check TODO list and prior state
2. **Continue from where you left off**: Pick up incomplete tasks
3. **Delegate in parallel**: Route tasks to specialist agents
4. **Run long operations in background**: Builds, tests, installs
5. **Verify completion with fresh evidence**:
   - Identify what command proves the task is complete
   - Run verification (test, build, lint)
   - Read the output - confirm it actually passed
   - Check: zero pending/in_progress TODO items
6. **Architect verification**: Get approval from architect role
7. **On approval**: Run `$cancel` to cleanly exit
8. **On rejection**: Fix issues and re-verify

## State Management

Write state on start, update on iteration, mark inactive on completion.

```json
{
  "mode": "ralph",
  "active": true,
  "iteration": 1,
  "max_iterations": 10,
  "current_phase": "executing"
}
```

## Final Checklist

- [ ] All requirements met
- [ ] Zero pending/in_progress TODO items
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Verification passed
- [ ] `$cancel` run for cleanup
