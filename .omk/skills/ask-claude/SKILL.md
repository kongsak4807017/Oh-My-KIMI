---
name: ask-claude
description: Query Claude AI and capture artifact
---

# Ask Claude Skill

Send queries to Claude AI and capture structured responses.

## Use When

- Need Claude's perspective
- Claude excels at this task type
- Cross-reference with Kimi

## Prerequisites

- ANTHROPIC_API_KEY environment variable
- Claude CLI installed (optional)

## Process

1. Formulate query for Claude
2. Send via API or CLI
3. Capture response artifact
4. Integrate with OMK workflow

## Output

Saves to `.omk/artifacts/ask-claude/{timestamp}.md`

## Usage

```
$ask-claude "explain this regex"
$ask-claude --file=code.ts "review this"
$ask-claude --compare "same query to Kimi"
```

## Comparison Mode

Use with `--compare` to get both Claude and Kimi responses:

```
$ask-claude --compare "best way to handle errors in async code"
```

## Note

Requires separate Claude API key. Not a replacement for Kimi, but complementary tool.
