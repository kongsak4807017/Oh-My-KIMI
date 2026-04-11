---
name: ultrawork
description: High-throughput parallel agent execution
---

# Ultrawork Skill

Maximum parallelization for high-throughput tasks.

## Use When

- "ultrawork", "ulw", "parallel", "batch"
- Large-scale operations
- Batch processing
- Maximum throughput

## Features

### Maximum Parallelism
```
$ultrawork --agents=10 "process files"
```

### Batch Processing
```
$ultrawork --batch=100 "analyze"
```

### Work Distribution
```
$ultrawork --shard --workers=4
```

## Modes

### Map-Reduce
```
$ultrawork --map="extract" --reduce="aggregate"
```

### Fan-Out
```
$ultrawork --fanout "independent tasks"
```

### Pipeline
```
$ultrawork --pipeline stage1,stage2,stage3
```

## Performance

- Auto-scales agents
- Load balancing
- Progress tracking
- Error recovery

## Usage

```
$ultrawork "migrate data"
$ultrawork --concurrent=20 "generate reports"
$ultrawork --queue tasks.json
```

## Monitoring

```
$ultrawork status
$ultrawork progress
$ultrawork workers
```

## Comparison

| Mode | Agents | Use Case |
|------|--------|----------|
| $team | 3-6 | Coordinated |
| $swarm | 5-10 | Exploration |
| $ultrawork | 10+ | Throughput |

## Resource Limits

Configure max resources:
```bash
OMK_ULW_MAX_AGENTS=20
OMK_ULW_MAX_MEMORY=4G
```
