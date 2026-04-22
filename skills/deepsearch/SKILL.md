---
name: deepsearch
description: Deep codebase search with context understanding
---

# Deepsearch Skill

Intelligent codebase search that understands context and relationships.

## Use When

- "find where X is used"
- "search for pattern Y"
- Understanding code relationships
- Tracing data flow

## Search Types

### Symbol Search
```
$deepsearch symbol UserService
$deepsearch function calculateTotal
```

### Pattern Search
```
$deepsearch pattern "async function.*Error"
$deepsearch regex "TODO|FIXME|XXX"
```

### Reference Search
```
$deepsearch references UserModel
$deepsearch imports react-router
```

### Call Graph
```
$deepsearch callers loginFunction
$deepsearch callees authMiddleware
```

## Advanced Options

```
$deepsearch --type=ts --scope=src "pattern"
$deepsearch --context=5 "search term"
$deepsearch --files-only "pattern"
```

## Output Format

```
File: src/auth.ts:42
Context:
  40 | function authenticate() {
  41 |   const user = getUser();
  42 >   if (!user) throw new AuthError();
  43 |   return user;
  44 | }

Related: src/middleware.ts:15 (caller)
```

## Usage

```
$deepsearch "where is auth checked"
$deepsearch --all "deprecated"
```
