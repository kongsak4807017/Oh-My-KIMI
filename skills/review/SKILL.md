---
name: review
description: General review and feedback
---

# Review Skill

General-purpose review for various artifacts.

## Use When

- "review", "feedback"
- Documents, plans, specs
- Non-code artifacts
- General assessment

## Review Types

### Document Review
```
$review docs/spec.md
$review PRD.md --focus=requirements
```

### Plan Review
```
$review .omk/plans/feature.md
```

### Architecture Review
```
$review --type=architecture docs/adr
```

### Design Review
```
$review --type=design mockups/
```

## Review Dimensions

- Completeness
- Clarity
- Consistency
- Feasibility
- Risks
- Alternatives

## Output

```markdown
# Review: [Artifact]

## Summary
Status: [APPROVED / COMMENTS / CHANGES_REQUESTED]

## Strengths
- Point 1
- Point 2

## Concerns
- Issue 1
- Issue 2

## Recommendations
1. [Specific action]

## Questions
1. [Clarification needed]
```

## Usage

```
$review README.md
$review --type=security policy.md
$review --strict requirements.md
```

## Comparison

| Skill | Use For |
|-------|---------|
| $review | General artifacts |
| $code-review | Code specifically |
| $security-review | Security focus |
