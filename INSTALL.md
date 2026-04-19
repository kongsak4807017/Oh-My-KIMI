# Installation Guide

## Requirements

- Node.js 20+
- npm 10+
- Git for development installs
- Optional: tmux for native pane-based team mode on macOS/Linux
- Optional: Playwright for browser provider mode

## Install From GitHub

```bash
npm install -g github:kongsak4807017/oh-my-kimi
omk --version
omk setup
omk doctor
```

## Local Development Install

```bash
git clone https://github.com/kongsak4807017/oh-my-kimi.git
cd oh-my-kimi
npm install
npm run build
npm test
npm link
```

## Configure A Provider

OpenRouter:

```bash
export OPENROUTER_API_KEY="your_key"
export OPENROUTER_MODEL="openai/gpt-4o-mini"
omk --openrouter
```

PowerShell:

```powershell
$env:OPENROUTER_API_KEY="your_key"
$env:OPENROUTER_MODEL="openai/gpt-4o-mini"
omk --openrouter
```

Custom OpenAI-compatible API:

```bash
export CUSTOM_API_KEY="your_key"
export CUSTOM_API_BASE_URL="https://llm.example.com/v1"
export CUSTOM_API_MODEL="my-model"
omk --custom
```

Kimi/Moonshot preset:

```bash
export KIMI_API_KEY="your_key"
omk --kimi
```

Project config:

```toml
# .omk/config.toml
provider = "openrouter"
model = "openai/gpt-4o-mini"

[providers.openrouter]
baseUrl = "https://openrouter.ai/api/v1"
apiKeyEnv = "OPENROUTER_API_KEY"
```

## Verify

```bash
omk doctor
omk config init openrouter --global --model openai/gpt-4o-mini
omk plan "summarize this repository"
npm run build
npm test
```

## Troubleshooting

`omk: command not found`

Check that the npm global bin directory is on `PATH`, then reinstall or run `npm link` from a local clone.

`API key not set`

Set the provider-specific key or pass `--api-key-env <ENV_NAME>`.

`Custom API mode fails`

Confirm the endpoint is OpenAI-compatible and that the base URL includes the API version prefix, for example `https://host.example.com/v1`.

`Team mode says tmux is missing`

OMK now falls back to in-process lanes. Install tmux only if you want native split-pane workers:

```bash
brew install tmux
sudo apt install tmux
```

`PowerShell execution policy`

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
