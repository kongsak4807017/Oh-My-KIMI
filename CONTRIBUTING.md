# Contributing to Oh-my-KIMI

Thank you for your interest in contributing to OMK! 🎉

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Creating Skills](#creating-skills)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)

## Code of Conduct

Be respectful, inclusive, and constructive. We welcome contributors from all backgrounds and experience levels.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/oh-my-kimi.git`
3. Create a branch: `git checkout -b feature/your-feature`
4. Make changes
5. Submit a pull request

## Development Setup

```bash
# Fork and clone
git clone https://github.com/yourusername/oh-my-kimi.git
cd oh-my-kimi

# Install dependencies
npm install

# Build
npm run build

# Link for testing
npm link

# Run tests
npm test
```

### Watch Mode

```bash
npm run dev
```

## How to Contribute

### Reporting Bugs

1. Check existing issues first
2. Create a new issue with:
   - Clear title
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version)
   - Error messages/logs

### Suggesting Features

1. Open an issue with label `enhancement`
2. Describe the feature and use case
3. Discuss implementation approach

### Documentation

- Fix typos
- Improve explanations
- Add examples
- Translate to other languages

## Creating Skills

Skills are the heart of OMK. Here's how to create one:

### Skill Structure

```
skills/
└── your-skill/
    └── SKILL.md
```

### Skill Template

```markdown
---
name: your-skill
description: Brief description of what this skill does
---

# Your Skill Name

Longer description here.

## Use When

- "trigger phrase 1"
- "trigger phrase 2"

## Steps

1. Step one
2. Step two
3. Step three

## Usage

```
$your-skill "task description"
$your-skill --option value
```

## Examples

Good:
```
$your-skill "specific task"
```

Bad:
```
vague task without details
```

## Output

What the skill produces.
```

### Skill Guidelines

1. **Clear triggers**: Make it easy to invoke
2. **Specific steps**: Actionable instructions
3. **Examples**: Show good and bad usage
4. **Checklists**: For verification
5. **Integration**: How it works with other skills

### Testing Your Skill

```bash
# Add skill to test project
mkdir -p ~/.omk/skills/your-skill
cp your-skill/SKILL.md ~/.omk/skills/your-skill/

# Test in REPL
omk
> $your-skill "test task"
```

## Submitting Changes

### Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new features
3. **Ensure build passes**:
   ```bash
   npm run build
   npm test
   ```
4. **Update CHANGELOG.md** with your changes
5. **Submit PR** with clear description

### PR Title Format

```
type(scope): description

Examples:
- feat(skill): add new deployment skill
- fix(cli): resolve path issue on Windows
- docs(readme): update installation guide
- refactor(api): simplify error handling
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

## Coding Standards

### TypeScript Style

```typescript
// Use explicit types
function greet(name: string): string {
  return `Hello, ${name}`;
}

// Use interfaces for objects
interface Config {
  name: string;
  version: string;
}

// Async/await preferred
async function fetchData(): Promise<Data> {
  const response = await fetch('/api/data');
  return response.json();
}
```

### Code Organization

```
src/
├── api/           # External API clients
├── cli/           # CLI commands
├── mcp/           # MCP server
├── plugins/       # Plugin system
├── repl/          # Interactive REPL
├── state/         # State management
├── team/          # Team mode
└── utils/         # Utilities
```

### Error Handling

```typescript
// Use custom errors
class OMKError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'OMKError';
  }
}

// Handle gracefully
try {
  await riskyOperation();
} catch (err) {
  if (err instanceof OMKError) {
    console.error(`[${err.code}] ${err.message}`);
  } else {
    console.error('Unexpected error:', err);
  }
}
```

### Testing

```typescript
// Write tests for new features
import { test } from 'node:test';
import assert from 'node:assert';

test('feature does X', async () => {
  const result = await myFeature();
  assert.strictEqual(result, expected);
});
```

## Development Tips

### Debug Mode

```bash
# Enable debug logging
DEBUG=omk* omk
```

### Test Local Changes

```bash
# After making changes
npm run build
npm link

# Test
omk doctor
```

### Working with Skills

```bash
# Test skill without installing
omk setup
# Edit .omk/skills/test-skill/SKILL.md
# Test in REPL
omk
> $test-skill "test"
```

## Review Process

1. **Automated checks** must pass
2. **Code review** by maintainers
3. **Documentation review** if needed
4. **Merge** when approved

## Questions?

- Open an issue for discussion
- Join our community chat (coming soon)
- Email: omk@example.com

## Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

Thank you for contributing to OMK! 🚀
