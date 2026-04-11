# Oh-my-KIMI (OMK) 🚀

[![npm version](https://img.shields.io/npm/v/omk-cli)](https://www.npmjs.com/package/omk-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

> **Multi-agent orchestration CLI for [Kimi AI](https://www.moonshot.cn/)** - 36+ skills for autonomous software development with Level 3 Token Optimization

Inspired by [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex), OMK brings powerful workflow patterns to Kimi's API with an extensive skill library, IDE-style autocomplete, and smart context management for projects of any size.

---

## ✨ What's New in v0.2.0

### 🧠 Level 3 Token Optimization
- **Smart Context Compression** - Auto-compresses conversation history to fit within token limits
- **Semantic Caching** - Reuses responses for similar queries (saves tokens!)
- **Intelligent Pruning** - Prioritizes important messages, summarizes old ones
- **Token Monitoring** - Real-time stats with `/tokens` command

### 🎯 IDE-Style Interactive Autocomplete
- **Tab Completion** for `/` `@` `$` commands
- **Arrow Navigation** - Use ↑↓ to select suggestions
- **Real-time Filtering** - Type to filter suggestions instantly
- **File Browser** - `@` shows files recursively with directory support

### 💬 Session Management
- **`/sessions`** - List all saved sessions with metadata
- **`/title`** - Set custom session titles
- **Auto-save** - Sessions saved automatically after each chat
- **Resume Anytime** - Pick up where you left off

### 📁 Large Codebase Support (100K+ lines)
- **`/index`** - Build codebase index for fast search
- **`/map`** - View repository overview (files, languages, modules)
- **`/search`** - Find symbols across the entire codebase
- **Smart File Selection** - AI gets only relevant files, not everything

---

## 📦 Installation

### Quick Start

```bash
# Install from GitHub (latest version)
npm install -g github:kongsak4807017/oh-my-kimi

# Or from npm (when available)
npm install -g omk-cli
```

### Prerequisites

- **Node.js 20+** - [Download here](https://nodejs.org/)
- **Kimi API Key** (optional) - [Get from Moonshot](https://platform.moonshot.cn/) or use CLI mode

### Setup

```bash
# Set API key (optional - can use CLI/browser mode instead)
export KIMI_API_KEY="your_api_key_here"  # Linux/Mac
set KIMI_API_KEY=your_api_key_here        # Windows CMD
$env:KIMI_API_KEY="your_api_key_here"    # PowerShell

# Verify installation
omk --version
```

---

## 🚀 Quick Start

```bash
# Start OMK in current directory
omk

# You'll see:
# >> Launching Oh-my-KIMI...
# [GLOBAL] Root Agent active
# Welcome to Oh-my-KIMI (OMK)
# [OK] Provider: cli (reasoning: medium)
# Type /help for commands, /exit to quit
#
# omk > |
```

### Your First Chat

```bash
omk > hello, what can you do?
# AI responds with capabilities overview

omk > /help
# Shows all available commands

omk > /sessions
# Shows saved sessions
```

---

## 🎮 Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands and help |
| `/skills` | List available skills |
| `/tools` | List available tools |
| `/sessions` | 🆕 List saved sessions |
| `/title <text>` | 🆕 Set session title |
| `/tokens` | 🆕 Show token usage stats |
| `/cache` | 🆕 Show cache statistics |
| `/index` | 🆕 Build codebase index |
| `/map` | 🆕 Show repository overview |
| `/search <symbol>` | 🆕 Search symbols |
| `/file <path>` | Add file to context |
| `/files` | Show files in context |
| `/context` | Show full context |
| `/clear` | Clear screen |
| `/exit` | Exit OMK |

### Skills ($)

| Skill | Description |
|-------|-------------|
| `$ralph "task"` | Persistent task completion |
| `$team "task"` | Multi-agent execution |
| `$plan "task"` | Create execution plan |
| `$autopilot "task"` | Full pipeline mode |
| `$code-review [file]` | Code review |
| `$security-review` | Security audit |
| `$git-master [cmd]` | Git operations |
| `$analyze` | Codebase analysis |

### Tools ($)

| Tool | Description |
|------|-------------|
| `$read_file <path>` | Read file contents |
| `$write_file <path>` | Write to file |
| `$list_directory [path]` | List directory |
| `$search_files <pattern>` | Search files |
| `$web_fetch <url>` | Fetch URL content |
| `$diagnostics` | TypeScript diagnostics |
| `$execute_command <cmd>` | Execute shell command |
| `$memory_read/write` | Project memory |

---

## 🎯 Interactive Features

### Autocomplete (IDE-Style)

Type any prefix to see suggestions:

```bash
omk > /
  /help          Show all commands
  /sessions      List saved sessions
  /tokens        Show token stats
  ...

omk > $re
  $read_file     Read file
  $execute_command Run command

omk > @src/
  @src/index.ts
  @src/utils.ts
  @src/components/
```

**Navigation:**
- `↑` `↓` - Navigate suggestions
- `Tab` - Accept suggestion
- `Enter` - Execute
- Type more - Filter results

### File References (@)

Reference files in your project:

```bash
omk > Check this file: @src/main.ts
omk > What's wrong with @package.json?
omk > Review @src/components/Button.tsx
```

Files are automatically read and added to context.

---

## 🧠 Token Optimization (Level 3)

OMK automatically manages context to stay within token limits:

### Automatic Compression
- **Sliding Window** - Keeps recent messages
- **Smart Pruning** - Removes old AI responses, keeps user questions
- **Summarization** - Condenses old conversations
- **Semantic Cache** - Reuses similar responses

### Monitoring

```bash
omk > /tokens

📊 Context Statistics:
   Total: 12,450 tokens
   └─ Messages: 8,230
   └─ Files: 4,220
   💾 Cache saved: 24,500 tokens
   🎯 Target: 80,000 tokens
   [████░░░░░░░░░░░░░░░░] 15%
```

---

## 📁 Working with Large Projects

For projects with 100K+ lines of code:

```bash
# 1. Build codebase index
omk > /index
[Building codebase index...]
Indexed: 1500/1500 files

# 2. View repository overview
omk > /map
📊 Repository Overview:
  Files: 1,500
  Lines: 125,000
  Languages:
    TypeScript: 60% (900 files)
    Rust: 25% (375 files)

# 3. Search for symbols
omk > /search AuthService
  src/services/auth.ts (relevance: 45)
  src/middleware/auth.ts (relevance: 38)

# 4. AI automatically gets relevant files
omk > Explain how AuthService works
# AI receives only relevant files, not entire codebase
```

---

## 💬 Session Management

```bash
# View all sessions
omk > /sessions

💬 Saved Sessions:

→ 1. refactor auth module
     5m ago · 15 msgs · session-abc123
     [current session]

  2. fix bug in login
     1h ago · 23 msgs · session-def456

  3. สร้าง API documentation
     yesterday · 8 msgs · session-ghi789

# Set session title
omk > /title "Authentication Refactor"
[OK] Session title set to: "Authentication Refactor"
```

---

## 🔧 Configuration

### Provider Selection

OMK supports multiple connection methods:

| Provider | Description | Setup |
|----------|-------------|-------|
| `api` | Direct API connection | Set `KIMI_API_KEY` |
| `cli` | Official Kimi CLI | Install `kimi` CLI |
| `browser` | Web interface | Requires login |
| `auto` | Auto-detect best | Default |

```bash
# Switch provider
omk > /model api
omk > /model cli
omk > /model browser
```

### Global Config

OMK stores config in `~/.omk/`:

```
~/.omk/
├── AGENTS.md          # Global agent instructions
├── skills/            # Global skills
├── state/             # Session states
└── notepad.md         # Global notes
```

---

## 🖥️ Platform Notes

### Windows
- Use **Command Prompt** or **PowerShell**
- If PowerShell shows execution policy errors:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
- **TUI mode disabled** on Windows (raw mode not supported)
- Uses classic REPL with full autocomplete support

### macOS / Linux
- Full TUI support available
- tmux integration for team mode
- Native terminal title updates

---

## 🛠️ Development

```bash
git clone https://github.com/kongsak4807017/oh-my-kimi.git
cd oh-my-kimi
npm install
npm run build
npm link

# Watch mode
npm run dev
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

- Inspired by [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex)
- Powered by [Kimi AI](https://www.moonshot.cn/)
- Built with ❤️ for the developer community

---

**Happy Coding! 🚀**
