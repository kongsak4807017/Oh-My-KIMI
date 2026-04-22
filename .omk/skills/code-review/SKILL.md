---
name: code-review
description: Comprehensive code review with multiple dimensions
---

# Code Review Skill

Perform multi-dimensional code review with structured feedback.

## Use When

- "review code", "code review", "CR"
- Before merging important changes
- Learning from existing code

## Review Dimensions

### 1. Correctness
- [ ] Logic is correct
- [ ] Edge cases handled
- [ ] No obvious bugs
- [ ] Error handling appropriate

### 2. Readability
- [ ] Naming is clear
- [ ] Functions are focused
- [ ] Comments explain why, not what
- [ ] No unnecessary complexity

### 3. Maintainability
- [ ] DRY principle followed
- [ ] SOLID principles respected
- [ ] Easy to test
- [ ] Dependencies are justified

### 4. Performance
- [ ] No obvious inefficiencies
- [ ] Algorithm complexity appropriate
- [ ] No unnecessary allocations

### 5. Security
- [ ] Input validated
- [ ] No injection vulnerabilities
- [ ] Secrets not exposed

## Output Format

```markdown
# Code Review: [File/Scope]

## Summary
Overall assessment: [APPROVE / COMMENT / REQUEST_CHANGES]

## Detailed Findings

### [Dimension]
- **Issue**: [Description]
- **Location**: [Line/File]
- **Severity**: [Critical/Major/Minor]
- **Suggestion**: [Fix recommendation]

## Action Items
- [ ] [Specific fix needed]
```

## Usage

```
$code-review src/auth.ts
$code-review --pr=123
$code-review --since=main
```
