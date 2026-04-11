---
name: tdd
description: Test-Driven Development workflow
---

# TDD Skill

Test-Driven Development workflow enforcement.

## Use When

- "tdd", "test first", "red-green-refactor"
- Writing new features
- Ensuring test coverage

## TDD Cycle

### 1. Red 🟥
Write a failing test first.

```
$tdd start "calculate total price"
```

Actions:
- Create test file
- Write failing test
- Run test (should fail)
- Commit: "test: add test for calculate total price"

### 2. Green 🟩
Write minimal code to pass.

```
$tdd implement
```

Actions:
- Implement feature
- Run test (should pass)
- Commit: "feat: implement calculate total price"

### 3. Refactor ♻️
Clean up while keeping tests green.

```
$tdd refactor
```

Actions:
- Improve code quality
- Run all tests
- Commit: "refactor: simplify total price calculation"

## Test Structure

```typescript
describe('Feature', () => {
  describe('Scenario', () => {
    it('should expected behavior', () => {
      // Arrange
      const input = ...;
      
      // Act
      const result = feature(input);
      
      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

## Coverage Requirements

| Category | Target |
|----------|--------|
| Lines | 80%+ |
| Functions | 90%+ |
| Branches | 70%+ |

## Commands

```
$tdd start "feature description"     # Start TDD cycle
$tdd test                            # Run tests
$tdd implement                       # Mark implementation phase
$tdd refactor                        # Mark refactor phase
$tdd coverage                        # Check coverage
$tdd commit                          # Smart commit with tests
```

## Usage

```
$tdd start "user registration"
# Write failing test...
$tdd implement
# Write code to pass...
$tdd refactor
# Clean up code...
```
