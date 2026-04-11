---
name: trace
description: Trace execution flow and debug
---

# Trace Skill

Trace execution flow for debugging and understanding.

## Use When

- "trace", "debug", "flow"
- Understanding execution
- Debugging issues
- Performance analysis

## Trace Types

### Function Trace
```
$trace function processOrder
$trace --depth=3 main
```

### Data Flow
```
$trace data userInput
$trace --from=Controller --to=Database
```

### Error Trace
```
$trace error "Cannot read property"
$trace --last-error
```

### Performance Trace
```
$trace perf slowFunction
$trace --time --memory
```

## Output Format

```
[TRACE] Function: processOrder
  ├─> validateInput (2ms)
  │   └─> checkSchema (0.5ms)
  ├─> saveToDatabase (45ms)
  │   └─> [SLOW] query execution
  └─> return result

Total: 48ms
Hot path: saveToDatabase (94%)
```

## Visualization

```
$trace --format=graph
$trace --format=flame
$trace --export=trace.json
```

## Usage

```
$trace request /api/users
$trace --async handleRequest
$trace --watch functionName
```

## Integration

Traces automatically saved to:
`.omk/traces/{timestamp}.json`

## Comparison

| Tool | Use |
|------|-----|
| $trace | Runtime tracing |
| $analyze | Static analysis |
| $debugger | Interactive debug |
