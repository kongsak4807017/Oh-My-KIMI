# OMK CLI

OMK is an OMX-style orchestration CLI for autonomous development workflows. It can run against OpenAI-compatible APIs, OpenRouter, custom gateways, Kimi/Moonshot, OAuth-backed native CLIs for Kimi/Gemini/Codex, or a browser fallback.

The project provides workflow skills such as `ralph`, `team`, `ultrawork`, `ultraqa`, `plan`, `deep-interview`, `code-review`, and `security-review`, plus local tools for files, search, command execution, memory, and web fetch.

## Install

```bash
npm install -g github:kongsak4807017/oh-my-kimi
omk setup
omk doctor
```

For local development:

```bash
npm install
npm run build
npm test
npm link
```

## Providers

Provider selection works from CLI flags, `.omk/config.toml`, `~/.omk/config.toml`, then environment variables.

| Provider | Use case | Required configuration |
| --- | --- | --- |
| `openrouter` | OpenRouter model gateway | `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL` |
| `custom` | Any OpenAI-compatible endpoint | `CUSTOM_API_KEY`, `CUSTOM_API_BASE_URL`, `CUSTOM_API_MODEL` |
| `api` | Generic OpenAI-compatible endpoint | `OMK_API_KEY`, `OMK_API_BASE_URL`, `OMK_MODEL` |
| `kimi` | Moonshot/Kimi API preset | `KIMI_API_KEY`, optional `KIMI_MODEL` |
| `cli` | Backward-compatible Kimi CLI OAuth alias | `kimi` command installed and logged in |
| `kimi-cli` | Reuse Kimi CLI OAuth/session | `kimi` command installed and logged in |
| `gemini-cli` | Reuse Gemini CLI OAuth/session | `gemini` command installed and logged in |
| `codex-cli` | Reuse Codex CLI OAuth/session | `codex` command installed and logged in |
| `browser` | Kimi web fallback | Playwright and an active browser session |
| `auto` | Best available provider | Default |

OpenRouter example:

```bash
export OPENROUTER_API_KEY="..."
export OPENROUTER_MODEL="openai/gpt-4o-mini"
omk --openrouter
omk ralph "fix the failing tests" --openrouter
```

Custom API example:

```bash
export CUSTOM_API_KEY="..."
export CUSTOM_API_BASE_URL="https://llm.example.com/v1"
export CUSTOM_API_MODEL="my-model"
omk --custom
```

OAuth CLI examples:

```bash
codex login
omk --codex-cli "explain this repo"

gemini
omk --gemini-cli

kimi login
omk --kimi-cli
```

One-off overrides:

```bash
omk --provider custom \
  --base-url https://llm.example.com/v1 \
  --api-key-env CUSTOM_API_KEY \
  --model my-model \
  --header X-Project=omk
```

## Config File

Create `.omk/config.toml` in a project or `~/.omk/config.toml` globally:

```toml
provider = "openrouter"
model = "openai/gpt-4o-mini"
reasoning = "medium"

[providers.openrouter]
baseUrl = "https://openrouter.ai/api/v1"
apiKeyEnv = "OPENROUTER_API_KEY"
model = "openai/gpt-4o-mini"

[providers.openrouter.headers]
X-Title = "OMK CLI"

[providers.custom]
baseUrl = "https://llm.example.com/v1"
apiKeyEnv = "CUSTOM_API_KEY"
model = "my-model"

[providers.codex-cli]
cliPath = "codex"
model = "gpt-5.4"
```

CLI flags override project config, project config overrides global config, and config overrides environment defaults.

## Common Commands

```bash
omk                       # start REPL
omk --openrouter          # start REPL on OpenRouter
omk --codex-cli           # start REPL using Codex CLI OAuth
omk --gemini-cli          # start REPL using Gemini CLI OAuth
omk --kimi-cli            # start REPL using Kimi CLI OAuth
omk "explain this repo"   # one-shot prompt
omk config show           # show merged config
omk config init openrouter --global --model openai/gpt-4o-mini
omk use custom --global --base-url https://host.example.com/v1 --api-key ollama --model model-name
omk model another-model --global
omk ralph "task"          # persistent completion loop
omk team "task"           # coordinated lanes; falls back to in-process on Windows/no tmux
omk ultrawork "task"      # high-throughput lane execution
omk plan "task"           # write an implementation plan
omk ultraqa "."           # run QA review cycle
omk code-review           # review code
omk security-review       # security audit
```

Inside the REPL:

```text
/help
/skills
/model openrouter
/file src/index.ts
/rag provider auth flow --web --rebuild
/search ProviderManager
$ralph "complete this change"
```

## Tool Execution

OMK exposes structured tools to OpenAI-compatible providers:

- `read_file`, `write_file`, `list_directory`, `search_files`
- `web_fetch`, `web_search`
- `rag_search` for compact local code snippets and optional web snippets
- `diagnostics`, `document_symbols`, `find_references`
- `execute_command`
- `memory_read`, `memory_write`

The orchestration engines use structured tool calls when the provider supports them and retain text-action fallback for models that emit `$read_file ...` style commands.

Use `/rag <query>` or `$rag_search <query>` when the model needs evidence without loading whole files or pages. The RAG protocol builds and reuses `.omk/index/rag-index.json`, ranks relevant chunks with deterministic sparse embeddings, adds optional `--web` snippets from full HTML search results, and returns a compact context block with an approximate token budget. Use `/rag <query> --rebuild` to force index refresh.

Safety boundaries:

- File tools are restricted to the current workspace.
- Command execution uses an allowlist and avoids shell interpretation in the tool path.
- Team mode uses tmux when available and an in-process fallback otherwise.
- `auto` provider selection is API-first, then tries OAuth CLI providers (`codex-cli`, `gemini-cli`, `kimi-cli`) before failing. Browser mode remains explicit.

## Verification

```bash
npm run build
npm test
```

Current test coverage includes provider config merging, OpenAI-compatible API request shape, OAuth CLI invocation shape, phase mapping, dashboard state, and skill routing.

## Notes

OMK can approximate OMX/Codex workflows through provider-backed orchestration, tools, and state. Native Codex subagents remain a Codex runtime capability; OMK's equivalent is its provider-backed engine and team lane system.
