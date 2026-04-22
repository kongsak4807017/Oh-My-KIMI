---
name: configure-notifications
description: Setup notification providers (Discord, Slack, Telegram)
---

# Configure Notifications Skill

Setup notification gateways for OMK alerts and updates.

## Use When

- Long-running tasks need alerts
- Team coordination
- CI/CD integration

## Supported Providers

- Discord
- Slack
- Telegram
- Custom webhook

## Configuration

### Discord
```
$configure-notifications discord
# Enter webhook URL
```

### Slack
```
$configure-notifications slack
# Enter webhook URL
```

### Telegram
```
$configure-notifications telegram
# Enter bot token and chat ID
```

## Usage in Skills

Other skills can send notifications:
```
$ralph "long task" --notify
$team "deploy" --notify=slack
```

## Environment Variables

```bash
OMK_NOTIFY_DISCORD_WEBHOOK=...
OMK_NOTIFY_SLACK_WEBHOOK=...
OMK_NOTIFY_TELEGRAM_BOT_TOKEN=...
OMK_NOTIFY_TELEGRAM_CHAT_ID=...
```

## Test

```
$configure-notifications test
```
