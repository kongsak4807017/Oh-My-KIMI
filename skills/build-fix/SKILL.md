---
name: build-fix
description: Automated build error diagnosis and fixing
---

# Build Fix Skill

Diagnose and fix build errors automatically.

## Use When

- "fix build", "build errors", "compilation failed"
- CI/CD failures
- Type errors, lint errors

## Error Categories

### TypeScript Errors
```
TS2345: Argument of type X is not assignable to Y
TS2304: Cannot find name X
TS2322: Type X is not assignable to type Y
TS7006: Parameter X implicitly has an any type
```

### Build Errors
- Module not found
- Import/export issues
- Syntax errors
- Missing dependencies

### Lint Errors
- ESLint violations
- Prettier formatting
- Import order
- Unused variables

## Process

1. **Capture Error Output**
   - Read build logs
   - Parse error messages
   - Group by file/category

2. **Analyze Root Cause**
   - Type mismatches
   - Missing imports
   - Configuration issues
   - Dependency conflicts

3. **Generate Fixes**
   - Type annotations
   - Import corrections
   - Config updates
   - Code adjustments

4. **Verify Fix**
   - Re-run build
   - Check for regressions
   - Validate types

## Auto-Fix Strategies

| Error | Strategy |
|-------|----------|
| Missing import | Add import statement |
| Type mismatch | Add type annotation |
| Unused var | Remove or prefix with _ |
| Formatting | Run prettier --write |
| Deprecated | Suggest alternative |

## Usage

```
$build-fix                # Fix all build errors
$build-fix --typecheck    # Fix type errors only
$build-fix --lint        # Fix lint errors only
$build-fix src/specific  # Fix specific directory
```
