---
name: visual-verdict
description: Visual QA comparison for UI/screenshot verification
---

# Visual Verdict Skill

Compare UI implementation against design references.

## Use When

- Visual UI tasks
- Screenshot comparison
- Design implementation review

## Process

### 1. Capture Reference
```
$visual-verdict reference https://example.com/design
$visual-verdict reference ./designs/homepage.png
```

### 2. Capture Implementation
```
$visual-verdict capture http://localhost:3000
```

### 3. Compare
```
$visual-verdict compare
```

## Comparison Dimensions

| Category | Weight | Check |
|----------|--------|-------|
| Layout | 30% | Alignment, spacing, structure |
| Colors | 25% | Brand colors, backgrounds |
| Typography | 20% | Fonts, sizes, weights |
| Components | 15% | Buttons, inputs, cards |
| Spacing | 10% | Margins, padding, gaps |

## Output Format

```json
{
  "score": 87,
  "verdict": "PASS",
  "threshold": 90,
  "breakdown": {
    "layout": { "score": 95, "issues": [] },
    "colors": { "score": 80, "issues": ["button color off"] },
    "typography": { "score": 90, "issues": [] },
    "components": { "score": 85, "issues": ["border radius"] },
    "spacing": { "score": 90, "issues": [] }
  },
  "recommendations": [
    "Update button primary color to #007bff",
    "Increase border radius to 8px"
  ]
}
```

## Verdict Levels

| Score | Verdict | Action |
|-------|---------|--------|
| 95-100 | EXCELLENT | Ship it |
| 90-94 | PASS | Minor tweaks |
| 80-89 | NEEDS_WORK | Fix issues |
| <80 | FAIL | Redo |

## Usage

```
$visual-verdict --reference=design.png --actual=screenshot.png
$visual-verdict --url=https://example.com --reference=design/
```

## Integration with Ralph

When ralph is active on visual tasks:
```
$ralph --visual "implement homepage"
# Automatically runs $visual-verdict each iteration
```
