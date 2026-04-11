# Installation Guide

Complete installation guide for Oh-my-KIMI (OMK).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Global Installation](#global-installation)
- [Local Development](#local-development)
- [Windows Installation](#windows-installation)
- [macOS Installation](#macos-installation)
- [Linux Installation](#linux-installation)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js 20+** - [Download here](https://nodejs.org/)
- **Kimi API Key** - [Get from Moonshot](https://platform.moonshot.cn/)
- **Git** - For cloning (development only)
- **tmux** - Optional, for team mode

### Check Prerequisites

```bash
node --version    # Should be v20+
npm --version     # Should be 10+
git --version     # Any recent version
tmux -V           # Optional, for team mode
```

## Global Installation

### From npm (When Published)

```bash
npm install -g oh-my-kimi
```

### From GitHub (Latest)

```bash
npm install -g github:yourusername/oh-my-kimi
```

### From Local Clone

```bash
git clone https://github.com/yourusername/oh-my-kimi.git
cd oh-my-kimi
npm install
npm run build
npm link
```

## Local Development

### Setup

```bash
# Clone repository
git clone https://github.com/yourusername/oh-my-kimi.git
cd oh-my-kimi

# Install dependencies
npm install

# Build TypeScript
npm run build

# Link for global access
npm link

# Or use directly
node dist/cli/omk.js --version
```

### Development Workflow

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Build once
npm run build

# Run tests
npm test

# Check health
npm run doctor
```

## Windows Installation

### Option 1: Command Prompt / PowerShell

```powershell
# Install globally
npm install -g oh-my-kimi

# Set API key (PowerShell)
$env:KIMI_API_KEY="your_key_here"

# Or permanently (PowerShell)
[Environment]::SetEnvironmentVariable("KIMI_API_KEY", "your_key_here", "User")
```

### Option 2: Git Bash / WSL

```bash
# Same as Linux/Mac
npm install -g oh-my-kimi
export KIMI_API_KEY=your_key_here
```

### Windows-Specific Notes

1. **Execution Policy**: If you get execution policy errors:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
   Or use `cmd` instead of PowerShell.

2. **tmux on Windows**: Install via:
   ```powershell
   winget install psmux
   # Or use WSL: wsl sudo apt install tmux
   ```

## macOS Installation

### Using Homebrew (Recommended)

```bash
# Install Node.js if not present
brew install node

# Install tmux (optional, for team mode)
brew install tmux

# Install OMK
npm install -g oh-my-kimi
```

### Set API Key

```bash
# Add to ~/.zshrc or ~/.bash_profile
echo 'export KIMI_API_KEY=your_key_here' >> ~/.zshrc
source ~/.zshrc
```

## Linux Installation

### Ubuntu/Debian

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install tmux (optional)
sudo apt install tmux

# Install OMK
npm install -g oh-my-kimi
```

### Fedora/RHEL

```bash
# Install Node.js
sudo dnf install nodejs20

# Install tmux
sudo dnf install tmux

# Install OMK
npm install -g oh-my-kimi
```

### Arch Linux

```bash
# Install Node.js
sudo pacman -S nodejs npm

# Install tmux
sudo pacman -S tmux

# Install OMK
npm install -g oh-my-kimi
```

### Set API Key

```bash
# Add to ~/.bashrc or ~/.zshrc
echo 'export KIMI_API_KEY=your_key_here' >> ~/.bashrc
source ~/.bashrc
```

## Verification

After installation, verify everything works:

```bash
# Check version
omk --version
# Output: oh-my-kimi v0.1.0

# Check health
omk doctor

# Initialize a project
mkdir my-project
cd my-project
omk setup

# Start REPL
omk
```

## Upgrading

```bash
# Global installation
npm update -g oh-my-kimi

# Or reinstall
npm uninstall -g oh-my-kimi
npm install -g oh-my-kimi
```

## Uninstalling

```bash
# Global uninstall
npm uninstall -g oh-my-kimi

# Remove local data
rm -rf ~/.omk
```

## Troubleshooting

### "omk: command not found"

1. Check npm global bin is in PATH:
   ```bash
   npm bin -g
   # Add to PATH if needed
   ```

2. Reinstall:
   ```bash
   npm uninstall -g oh-my-kimi
   npm install -g oh-my-kimi
   ```

### "Cannot find module"

Build the project:
```bash
cd oh-my-kimi
npm run build
```

### "KIMI_API_KEY not set"

Set the environment variable:
```bash
export KIMI_API_KEY=your_key_here
```

### "tmux not found" (Team mode)

Install tmux:
```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux

# Windows (WSL)
wsl sudo apt install tmux
```

### PowerShell Execution Policy

If you see execution policy errors in PowerShell:

```powershell
# Check current policy
Get-ExecutionPolicy

# Set policy (requires admin for AllUsers scope)
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or use cmd instead
cmd /c "omk --version"
```

### npm Permission Errors

If you get EACCES errors:

```bash
# Change npm directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Reinstall
npm install -g oh-my-kimi
```

## Next Steps

After installation:

1. **Set API Key**: `export KIMI_API_KEY=your_key`
2. **Initialize Project**: `omk setup`
3. **Try REPL**: `omk`
4. **Read Docs**: See [README.md](README.md)

## Support

- GitHub Issues: [Report bugs](https://github.com/yourusername/oh-my-kimi/issues)
- Documentation: [Full docs](https://github.com/yourusername/oh-my-kimi#readme)
