---
name: pipeline
description: Multi-stage pipeline execution
---

# Pipeline Skill

Execute multi-stage pipelines with dependencies and artifacts.

## Use When

- Complex multi-step workflows
- CI/CD-like operations
- Data processing pipelines
- "pipeline", "stage", "workflow"

## Pipeline Structure

```yaml
# .omk/pipelines/deploy.yml
stages:
  - name: lint
    command: npm run lint
    
  - name: test
    command: npm test
    depends_on: [lint]
    
  - name: build
    command: npm run build
    depends_on: [test]
    
  - name: deploy
    command: npm run deploy
    depends_on: [build]
```

## Usage

```
$pipeline                      # List pipelines
$pipeline deploy               # Run pipeline
$pipeline deploy --stage=build # Start from stage
$pipeline --dry-run            # Preview only
```

## Features

### Parallel Execution
```yaml
stages:
  - name: test-unit
  - name: test-integration
  - name: test-e2e
    parallel: true
```

### Conditional Stages
```yaml
stages:
  - name: deploy-prod
    condition: branch == 'main'
```

### Artifacts
```yaml
stages:
  - name: build
    artifacts:
      - dist/**
```

## Status

```
$pipeline status
$pipeline logs <run-id>
$pipeline cancel
```

## Built-in Pipelines

- `test`: Lint -> Test
- `build`: Test -> Build
- `release`: Build -> Tag -> Release
