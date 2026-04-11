---
name: swarm
description: Swarm intelligence pattern for exploration
---

# Swarm Skill

Swarm intelligence pattern for parallel exploration and voting.

## Use When

- "swarm", "explore options"
- Need multiple perspectives
- Voting/consensus
- Parallel exploration

## How It Works

1. **Spawn** multiple agents
2. **Explore** different approaches
3. **Vote** on best solution
4. **Consolidate** results

## Usage

```
$swarm "find best library for X"
$swarm 5 "explore solutions"
$swarm --vote="ranking"
```

## Voting Methods

### Ranking
Agents rank options:
```
$swarm --vote=ranking "compare frameworks"
```

### Scoring
Agents score 1-10:
```
$swarm --vote=score "evaluate design"
```

### Binary
Approve/Reject:
```
$swarm --vote=binary "check requirements"
```

## Output

```markdown
# Swarm Results

## Options Explored
1. Option A (3 votes)
2. Option B (5 votes) ⭐
3. Option C (2 votes)

## Consensus
Best approach: Option B

## Reasons
- Point 1
- Point 2

## Dissent
Agent 3 prefers A because...
```

## Comparison

| Mode | Use When |
|------|----------|
| $team | Coordinated execution |
| $swarm | Exploration & voting |
| $ralph | Persistent single-agent |

## Usage

```
$swarm 3 "solve this bug"
$swarm --explore="approaches" "design API"
```
