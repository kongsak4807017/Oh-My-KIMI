---
name: ask-gemini
description: Query Google Gemini and capture artifact
---

# Ask Gemini Skill

Send queries to Google Gemini and capture structured responses.

## Use When

- Need Gemini's perspective
- Large context window needed
- Cross-reference with other models

## Prerequisites

- GEMINI_API_KEY environment variable

## Process

1. Formulate query for Gemini
2. Send via API
3. Capture response artifact
4. Integrate with OMK workflow

## Features

- Large context window (1M+ tokens)
- Multimodal (text, images, video)
- Fast responses

## Output

Saves to `.omk/artifacts/ask-gemini/{timestamp}.md`

## Usage

```
$ask-gemini "summarize this codebase"
$ask-gemini --file=large.log "find errors"
$ask-gemini --compare "same query to Kimi"
```

## Comparison Mode

Use with `--compare` to get both Gemini and Kimi responses.

## Note

Requires separate Gemini API key. Useful for large context tasks.
