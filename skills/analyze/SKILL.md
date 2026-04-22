---
name: analyze
description: Deep codebase analysis and investigation
---

# Analyze Skill

Deep analysis of codebase structure, patterns, and issues.

## Use When

- "analyze", "investigate", "understand"
- Exploring unfamiliar code
- Architecture review
- Finding patterns

## Analysis Types

### Structure Analysis
```
$analyze structure           # Project structure
$analyze dependencies        # Dependency graph
$analyze imports             # Import relationships
```

### Code Analysis
```
$analyze complexity          # Cyclomatic complexity
$analyze duplication         # Code duplication
$analyze coverage            # Test coverage gaps
```

### Pattern Analysis
```
$analyze patterns            # Design patterns used
$analyze antipatterns        # Code smells
$analyze architecture        # Architecture assessment
```

## Output Format

```markdown
# Codebase Analysis

## Overview
- Files: [N]
- Languages: [TypeScript, JavaScript, ...]
- Lines of Code: [N]

## Dependencies
- Direct: [N]
- Dev: [N]
- Outdated: [List]

## Code Quality
- Complexity: [Score]
- Duplication: [N] instances
- Test Coverage: [N]%

## Findings
### High Impact
1. [Issue] - [Recommendation]

### Medium Impact
...

## Recommendations
- [Specific action items]
```

## Metrics

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| Complexity | <10 | 10-20 | >20 |
| File Length | <200 | 200-500 | >500 |
| Function Length | <20 | 20-50 | >50 |
| Duplication | 0% | <5% | >5% |

## Usage

```
$analyze
$analyze src/core
$analyze --depth=deep
$analyze --focus=performance
```
