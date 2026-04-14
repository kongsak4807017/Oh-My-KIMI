# Changelog

All notable changes to Oh-my-KIMI (OMK) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2025-04-14

### Added
- IDE-style interactive autocomplete with tab completion and file browser
- Session management (/sessions, /title, auto-save)
- Level 3 Token Optimization (smart context compression, semantic caching)
- Large codebase support (/index, /map, /search)
- Activity logger with real-time HUD
- Skill runtime with keyword auto-detection
- GSD (Get Shit Done) executor for spec-driven development
- Execution profile routing (agent/role/phase mapping)

### Changed
- Refactored CLI setup to use shared skill runtime
- Improved TUI agent panel and status HUD
- Updated provider manager initialization flow

### Fixed
- LF/CRLF line ending warnings on Windows
- Skill loading now falls back correctly from local to global skills

## [0.1.0] - 2025-04-11

## [0.1.0] - 2025-04-11

### Added

#### Core Features
- Interactive REPL for real-time chat with Kimi AI
- Skill system with 36+ built-in skills
- State persistence in `.omk/` directory
- Session save/load functionality
- Plugin architecture for custom extensions

#### Skills (36 Total)

**Core (10)**
- `ralph` - Persistent completion loop
- `ralph-init` - Quick Ralph initialization
- `ralplan` - Plan-then-execute workflow
- `team` - Multi-agent team execution
- `swarm` - Swarm intelligence pattern
- `worker` - Worker protocol
- `cancel` - Cancel active modes
- `plan` - Implementation planning
- `deep-interview` - Socratic requirements
- `autopilot` - Full autonomous pipeline

**Code Quality (8)**
- `code-review` - Comprehensive code review
- `security-review` - Security audit
- `analyze` - Codebase analysis
- `ai-slop-cleaner` - Clean AI-generated code
- `build-fix` - Fix build errors
- `tdd` - Test-driven development
- `ultraqa` - Intensive QA cycling
- `review` - General review

**Development (3)**
- `git-master` - Git workflow
- `pipeline` - Multi-stage pipelines
- `frontend-ui-ux` - Frontend development

**AI Integration (2)**
- `ask-claude` - Query Claude AI
- `ask-gemini` - Query Gemini AI

**Visual (2)**
- `visual-verdict` - Visual QA comparison
- `web-clone` - Website cloning

**Performance (3)**
- `ultrawork` - High-throughput parallel
- `ecomode` - Token-efficient mode
- `trace` - Execution tracing

**System (5)**
- `doctor` - Diagnose and fix
- `note` - Quick note taking
- `session` - Session management
- `hud` - Status monitoring
- `help` - Show help

**Management (3)**
- `skill` - Manage skills
- `configure-notifications` - Setup notifications
- `deepsearch` - Deep codebase search

#### CLI Commands
- `omk` - Launch interactive REPL
- `omk setup` - Initialize project
- `omk doctor` - Health check
- `omk <skill>` - Run skill directly

#### REPL Commands
- `/help` - Show help
- `/skills` - List skills
- `/file` - Add file to context
- `/note` - Add note
- `/task` - Create task
- `/plugins` - List plugins
- `/mcp` - Control MCP server
- `/save`, `/load` - Session management
- `/exit` - Quit

#### MCP Integration
- MCP server on port 3000
- Resources: state, tasks, notepad, memory
- Tools: create_task, list_tasks, append_notepad, read_file
- Prompts: code_review, plan_feature

#### Team Mode
- tmux-based multi-agent coordination
- Worker management
- Task assignment
- Mailbox system
- State persistence

#### Plugin System
- Dynamic plugin loading
- Lifecycle hooks
- Skill registration
- Custom commands
- Hook system

### Technical
- TypeScript codebase
- Node.js 20+ required
- ESM modules
- Zod for validation
- Built-in testing with Node.js test runner

[Unreleased]: https://github.com/kongsak4807017/oh-my-kimi/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/kongsak4807017/oh-my-kimi/releases/tag/v0.2.0
[0.1.0]: https://github.com/kongsak4807017/oh-my-kimi/releases/tag/v0.1.0
