---
name: skill
description: Manage OMK skills (list, install, update)
---

# Skill Management Skill

Manage OMK skills - list, install, update, remove.

## Use When

- "skill", "skills", "install skill"
- Manage available skills
- Discover new skills

## Commands

### List Skills
```
$skill list              # All skills
$skill list --category   # By category
$skill list --installed  # Installed only
$skill list --builtin    # Built-in only
```

### Install Skill
```
$skill install web-scraper
$skill install user/repo
$skill install ./local-skill
```

### Update Skills
```
$skill update            # Update all
$skill update ralph      # Update specific
```

### Remove Skill
```
$skill remove old-skill
```

### Create Skill
```
$skill create my-skill
# Interactive skill template
```

## Skill Sources

- **Built-in**: Included with OMK
- **Registry**: Official skill repository
- **Git**: Remote git repos
- **Local**: Local directories

## Categories

| Category | Skills |
|----------|--------|
| Core | ralph, team, plan |
| Code | code-review, build-fix, tdd |
| DevOps | pipeline, git-master |
| Quality | security-review, ultraqa |
| Utils | help, note, doctor |

## Usage

```
$skill search "test"
$skill info ralph
$skill create my-plugin
```
