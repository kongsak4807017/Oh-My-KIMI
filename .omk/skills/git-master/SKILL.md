---
name: git-master
description: Advanced Git operations and workflow management
---

# Git Master Skill

Expert Git workflow assistance.

## Use When

- "git", "commit", "branch", "merge", "rebase"
- Complex Git operations
- Repository cleanup

## Commands

### Commit Management
```
$git-master commit "message"     # Smart commit with scope detection
$git-master amend                # Amend last commit
$git-master squash N             # Squash last N commits
```

### Branch Operations
```
$git-master branch feature/x      # Create feature branch
$git-master checkout pr/123      # Checkout PR
$git-master sync                 # Sync with main
```

### History
```
$git-master log                  # Pretty log
$git-master blame file.ts        # Annotated history
$git-master find "pattern"       # Search history
```

### Advanced
```
$git-master bisect start         # Binary search bugs
$git-master cherry-pick abc123   # Selective commits
$git-master revert --pr=456      # Revert PR
```

## Smart Commit Messages

Auto-generate conventional commits:
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

## Workflow Helpers

### Pre-commit Checks
```
$git-master precommit            # Run lint, test, typecheck
```

### PR Preparation
```
$git-master pr-ready             # Check PR readiness
$git-master pr-description       # Generate PR description
```

## Usage

```
$git-master commit "add user authentication"
$git-master squash 3
$git-master sync
```
