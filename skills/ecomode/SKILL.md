---
name: ecomode
description: Token-efficient mode for cost-conscious work
---

# Ecomode Skill

Token-efficient operation mode for cost-conscious development.

## Use When

- "ecomode", "eco", "budget"
- Long-running tasks
- Cost-sensitive projects
- Reducing API usage

## Strategies

### 1. Concise Prompts
- Strip unnecessary context
- Use abbreviated formats
- Focus on essentials

### 2. Smart Caching
- Cache common responses
- Reuse previous analysis
- Minimize redundant calls

### 3. Batched Operations
- Group related tasks
- Reduce round-trips
- Efficient sequencing

### 4. Model Selection
- Use efficient models for simple tasks
- Reserve powerful models for complex work
- Automatic downgrading

## Usage

```
$ecomode                    # Enable for session
$ecomode --on               # Explicitly enable
$ecomode --off              # Disable
$ecomode status             # Check status
```

## With Other Skills

```
$ecomode $ralph "task"      # Ralph in eco mode
$ecomode $plan "feature"    # Planning in eco mode
```

## Indicators

When ecomode is active:
- Prompt shows [ECO]
- Responses are more concise
- Context window optimized

## Cost Savings

Typical savings: 40-60% token usage
Trade-off: Less verbose responses
