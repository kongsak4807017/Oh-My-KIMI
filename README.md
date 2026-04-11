# Oh-my-KIMI (OMK) 🚀

[![npm version](https://img.shields.io/npm/v/oh-my-kimi)](https://www.npmjs.com/package/oh-my-kimi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

> **Multi-agent orchestration CLI for [Kimi AI](https://www.moonshot.cn/)** - 36+ skills for autonomous software development

Inspired by [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex), OMK brings powerful workflow patterns to Kimi's API with an extensive skill library designed for real-world development tasks.

---

## ✨ Features

- 🎯 **36+ Built-in Skills** - Comprehensive skill library for every development need
- 🧠 **Smart Orchestration** - Automatic mode selection based on task complexity  
- 📝 **State Persistence** - Track progress across sessions in `.omk/`
- 👥 **Team Mode** - Multi-agent coordination with tmux
- 🔌 **MCP Integration** - Model Context Protocol support for tool interoperability
- 🔧 **Plugin System** - Extensible architecture for custom skills
- ⚡ **Interactive REPL** - Real-time chat with streaming responses
- 🌐 **Global Installation** - Install once, use anywhere with `npm install -g`

---

## 📦 Installation

### Prerequisites

- **Node.js 20+** - [Download here](https://nodejs.org/)
- **Kimi API Key** - [Get from Moonshot Platform](https://platform.moonshot.cn/)
- **tmux** (optional) - For team mode functionality

### Global Installation (Recommended)

#### From npm Registry
```bash
npm install -g oh-my-kimi
```

#### From GitHub (Latest Development Version)
```bash
npm install -g github:kongsak4807017/oh-my-kimi
```

> **Note:** Installing from GitHub always gets the latest version from the main branch, while npm may have a slightly older stable release.

### Local Development

```bash
git clone https://github.com/kongsak4807017/oh-my-kimi.git
cd oh-my-kimi
npm install
npm run build
npm link
```

### Platform-Specific Instructions

<details>
<summary><b>🪟 Windows</b></summary>

```powershell
# Install from npm
npm install -g oh-my-kimi

# Or install from GitHub (latest version)
npm install -g github:kongsak4807017/oh-my-kimi

# Set API key (PowerShell)
$env:KIMI_API_KEY="your_api_key_here"

# Or permanently
[Environment]::SetEnvironmentVariable("KIMI_API_KEY", "your_api_key_here", "User")

# Optional: Install tmux for team mode
winget install psmux
# Or use WSL: wsl sudo apt install tmux
```

**Note:** If you get execution policy errors in PowerShell, use Command Prompt instead:
```cmd
omk --version
```
</details>

<details>
<summary><b>🍎 macOS</b></summary>

```bash
# Install Node.js if needed
brew install node

# Install OMK from npm
npm install -g oh-my-kimi

# Or install from GitHub (latest version)
npm install -g github:kongsak4807017/oh-my-kimi

# Optional: Install tmux for team mode
brew install tmux

# Set API key (add to ~/.zshrc or ~/.bash_profile)
echo 'export KIMI_API_KEY=your_api_key_here' >> ~/.zshrc
source ~/.zshrc
```
</details>

<details>
<summary><b>🐧 Linux (Ubuntu/Debian)</b></summary>

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install OMK from npm
npm install -g oh-my-kimi

# Or install from GitHub (latest version)
npm install -g github:kongsak4807017/oh-my-kimi

# Optional: Install tmux for team mode
sudo apt install tmux

# Set API key (add to ~/.bashrc)
echo 'export KIMI_API_KEY=your_api_key_here' >> ~/.bashrc
source ~/.bashrc
```
</details>

---

## 🚀 Quick Start

### 1. Verify Installation

```bash
omk --version
# Output: oh-my-kimi v0.1.0

omk doctor
# Checks: Node.js, API key, OMK installation
```

### 2. Initialize Project

```bash
mkdir my-project
cd my-project
omk setup
# Creates .omk/ directory with 36 skills and AGENTS.md
```

### 3. Start Developing

```bash
# Launch interactive REPL
omk

# Or with high reasoning effort
omk --high
```

---

## 📖 Usage

### Interactive REPL Mode

```bash
$ omk
🚀 Welcome to Oh-my-KIMI (OMK)
Type /help for available commands, or /exit to quit.

omk > $ralph "refactor the authentication module"
omk > $plan "design REST API architecture"
omk > $code-review src/main.ts
omk > /help
omk > /exit
```

### Direct Commands

```bash
# Core skills
omk ralph "implement feature X"              # Persistent completion loop
omk team "fix all critical bugs"             # Multi-agent team execution
omk plan "design new microservice"           # Create implementation plan
omk deep-interview                           # Clarify requirements
omk autopilot "create CLI tool"              # Full autonomous pipeline

# Code quality
omk code-review src/auth.ts                  # Comprehensive code review
omk security-review                          # Security audit
omk analyze                                  # Codebase analysis

# Development
omk git-master commit "message"              # Smart git operations
omk pipeline deploy                          # Run CI/CD pipeline
omk tdd "implement calculator"               # Test-driven development

# System
omk doctor                                   # Health check
omk setup                                    # Initialize project
omk help                                     # Show help
```

### REPL Builtin Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/skills` | List all 36+ skills |
| `/clear` | Clear screen |
| `/file <path>` | Add file to context |
| `/note <text>` | Add to session notepad |
| `/task <title>` | Create a task |
| `/plugins` | List loaded plugins |
| `/mcp start` | Start MCP server |
| `/save [name]` | Save session |
| `/load [name]` | Load session |
| `/exit` | Quit OMK |

---

## 🎯 Skills Library (36 Skills)

### Core Skills (10)
| Skill | Trigger | Description |
|-------|---------|-------------|
| `$ralph` | "ralph", "don't stop" | Persistent completion loop until task done |
| `$ralph-init` | "ralph-init" | Quick Ralph initialization |
| `$ralplan` | "ralplan", "consensus plan" | Plan-then-execute workflow |
| `$team` | "team", "parallel" | Multi-agent team execution |
| `$swarm` | "swarm", "explore options" | Swarm intelligence pattern |
| `$worker` | "worker" | Team worker protocol |
| `$cancel` | "cancel", "stop", "abort" | Cancel active modes |
| `$plan` | "plan this", "let's plan" | Implementation planning |
| `$deep-interview` | "deep interview", "don't assume" | Socratic requirements clarification |
| `$autopilot` | "autopilot", "build me" | Full autonomous pipeline |

### Code Quality (8)
| Skill | Description |
|-------|-------------|
| `$code-review` | Comprehensive code review (correctness, readability, maintainability, performance, security) |
| `$security-review` | Security audit with CWE checks |
| `$analyze` | Deep codebase analysis |
| `$ai-slop-cleaner` | Clean up AI-generated code smells |
| `$build-fix` | Automated build error diagnosis and fixing |
| `$tdd` | Test-driven development cycle (Red-Green-Refactor) |
| `$ultraqa` | Intensive QA cycling for critical code |
| `$review` | General artifact review |

### Development (3)
| Skill | Description |
|-------|-------------|
| `$git-master` | Advanced Git workflow and conventional commits |
| `$pipeline` | Multi-stage CI/CD pipeline execution |
| `$frontend-ui-ux` | Frontend development and design review |

### AI Integration (2)
| Skill | Description |
|-------|-------------|
| `$ask-claude` | Query Claude AI for alternative perspective |
| `$ask-gemini` | Query Google Gemini (large context window) |

### Visual (2)
| Skill | Description |
|-------|-------------|
| `$visual-verdict` | Visual QA comparison against designs |
| `$web-clone` | Clone websites with verification pipeline |

### Performance (3)
| Skill | Description |
|-------|-------------|
| `$ultrawork` | High-throughput parallel agent execution |
| `$ecomode` | Token-efficient mode for cost-conscious work |
| `$trace` | Execution flow tracing and debugging |

### System (5)
| Skill | Description |
|-------|-------------|
| `$doctor` | Diagnose and fix OMK installation issues |
| `$note` | Quick note taking for session context |
| `$session` | Session management (save, load, resume) |
| `$hud` | Heads-up display for status monitoring |
| `$help` | Show help and available skills |

### Management (3)
| Skill | Description |
|-------|-------------|
| `$skill` | Manage OMK skills (install, update, remove) |
| `$configure-notifications` | Setup Discord/Slack/Telegram notifications |
| `$deepsearch` | Deep codebase search with context understanding |

---

## 🏗️ Project Structure

After `omk setup`, your project will have:

```
my-project/
├── .omk/                      # OMK state directory
│   ├── skills/               # 36 built-in skills
│   ├── state/                # Mode states and tasks
│   ├── plans/                # Generated plans
│   ├── logs/                 # Session logs
│   ├── context/              # Context snapshots
│   ├── interviews/           # Interview transcripts
│   ├── specs/                # Requirement specifications
│   ├── sessions/             # Saved sessions
│   ├── plugins/              # Custom plugins
│   └── notepad.md            # Session notes
├── AGENTS.md                  # Project guidance for AI
└── .gitignore                 # (OMK entries added)
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `KIMI_API_KEY` | ✅ Yes | Your Kimi API key | - |
| `KIMI_BASE_URL` | ❌ No | API base URL | `https://api.moonshot.cn/v1` |
| `OMK_MODEL` | ❌ No | Default model | `kimi-k2-0711-preview` |
| `OMK_NOTIFY_DISCORD_WEBHOOK` | ❌ No | Discord webhook URL | - |
| `OMK_NOTIFY_SLACK_WEBHOOK` | ❌ No | Slack webhook URL | - |
| `OMK_NOTIFY_TELEGRAM_BOT_TOKEN` | ❌ No | Telegram bot token | - |

### Config File

Create `.omk/config.json`:

```json
{
  "model": "kimi-k2-0711-preview",
  "reasoning": "high",
  "hud": {
    "refreshRate": 5000,
    "theme": "dark"
  },
  "ecomode": {
    "enabled": false,
    "maxTokensPerRequest": 2000
  }
}
```

---

## 🔌 MCP Integration

OMK includes a built-in MCP (Model Context Protocol) server for tool interoperability.

### Starting MCP Server

```bash
# In REPL
/mcp start     # Starts on port 3000
/mcp stop      # Stop server
```

### Available Resources

| Resource URI | Description |
|--------------|-------------|
| `omk://state/current` | Active modes and states |
| `omk://tasks/all` | All tasks list |
| `omk://notepad/current` | Session notepad content |
| `omk://memory/project` | Project memory |

### Available Tools

| Tool | Description |
|------|-------------|
| `omk_create_task` | Create a new task |
| `omk_list_tasks` | List all tasks |
| `omk_append_notepad` | Add to notepad |
| `omk_read_file` | Read project file |

---

## 🔧 Plugin Development

Create custom plugins in `.omk/plugins/`:

```javascript
// .omk/plugins/my-plugin.js
export default {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'My custom plugin',
  
  onLoad: async (context) => {
    context.api.log('info', 'My plugin loaded!');
  },
  
  registerSkills: () => [{
    name: 'my-skill',
    description: 'Does something cool',
    execute: async (args, context) => {
      console.log('Running my skill!', args);
    }
  }]
};
```

---

## 👥 Team Mode

Coordinate multiple AI agents with tmux integration.

### Prerequisites

- tmux installed
- Running inside tmux session

### Usage

```bash
# Start tmux session
tmux new -s omk-session

# Start team
omk team 3:executor "analyze codebase and fix bugs"

# Check status
omk team status my-team

# Resume team session
omk team resume my-team

# Shutdown team
omk team shutdown my-team
```

---

## 🐛 Troubleshooting

### "omk: command not found"

```bash
# Check npm global bin is in PATH
npm bin -g

# Reinstall
npm uninstall -g oh-my-kimi
npm install -g oh-my-kimi
```

### PowerShell Execution Policy (Windows)

```powershell
# Use Command Prompt instead
cmd /c "omk --version"

# Or change execution policy
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "KIMI_API_KEY not set"

```bash
export KIMI_API_KEY=your_key_here
```

### "tmux not found" (Team mode)

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Windows (WSL)
wsl sudo apt install tmux
```

---

## 📚 Documentation

- [Installation Guide](INSTALL.md) - Detailed installation instructions
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [Changelog](CHANGELOG.md) - Version history

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Start for Contributors

```bash
git clone https://github.com/kongsak4807017/oh-my-kimi.git
cd oh-my-kimi
npm install
npm run build
npm link
npm run dev  # Watch mode
```

---

## 🗺️ Roadmap

- [ ] VS Code Extension
- [ ] Web Dashboard UI
- [ ] More built-in skills (target: 50+)
- [ ] Enhanced team mode with web workers
- [ ] Docker support
- [ ] CI/CD integrations
- [ ] Multi-language support

---

## 📄 License

MIT © [Oh-my-KIMI Contributors](LICENSE)

---

## 🙏 Credits

- Inspired by [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) by Yeachan Heo
- Powered by [Kimi AI](https://www.moonshot.cn/) from Moonshot AI

---

<div align="center">

**[⭐ Star us on GitHub](https://github.com/kongsak4807017/oh-my-kimi)** • **[📦 npm Package](https://www.npmjs.com/package/oh-my-kimi)** • **[🐛 Report Issues](https://github.com/kongsak4807017/oh-my-kimi/issues)**

Made with ❤️ for the AI development community

</div>
