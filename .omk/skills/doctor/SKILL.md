---
name: doctor
description: Diagnose and fix OMK installation issues
---

# Doctor Skill

Diagnose and automatically fix common OMK issues.

## Use When

- OMK not working correctly
- After updates
- Environment problems
- "doctor", "diagnose", "fix"

## Diagnostics

### Environment Checks
- Node.js version
- Environment variables
- API key validity
- Network connectivity

### Installation Checks
- OMK directory structure
- Skills installed
- Config files valid
- Dependencies present

### Runtime Checks
- tmux availability
- Git configuration
- File permissions

## Auto-Fixes

Doctor can automatically fix:
- Recreate missing directories
- Reinstall corrupted skills
- Fix config file syntax
- Reset mode state

## Usage

```
$doctor              # Run all checks
$doctor --fix        # Auto-fix issues
$doctor --team       # Team mode diagnostics
$doctor --verbose    # Detailed output
```

## Report

Generates `.omk/doctor-report.md` with findings and fixes.

## Exit Codes

- 0: All good
- 1: Issues found (auto-fixable)
- 2: Critical issues (manual fix needed)
