---
name: deep-interview
description: Socratic requirements clarification
---

# Deep Interview Skill

Clarify vague requirements through targeted questions.

## Use When

- Request is broad or ambiguous
- Missing concrete acceptance criteria
- User says "deep interview", "don't assume"

## Process

1. **Analyze request** - Identify unclear areas
2. **Ask ONE question** - Focus on intent, not implementation
3. **Score clarity** - Track ambiguity reduction
4. **Repeat** - Until threshold met or max rounds

## Target Areas

- Intent: Why do you want this?
- Outcome: What does success look like?
- Scope: How far should this go?
- Constraints: What limits must we respect?
- Non-goals: What should we NOT do?

## Output

- Interview transcript in `.omk/interviews/`
- Spec document in `.omk/specs/`

## Usage

```
$deep-interview "build me a todo app"
```
