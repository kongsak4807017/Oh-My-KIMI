---
name: ultraqa
description: Intensive QA cycling for critical code
---

# UltraQA Skill

Intensive quality assurance with multiple verification passes.

## Use When

- "ultraqa", "QA", "quality"
- Critical code paths
- Before major releases
- Compliance requirements

## QA Cycle

### Phase 1: Automated
- Lint checks
- Type checks
- Unit tests
- Integration tests
- Coverage analysis

### Phase 2: Manual Review
- Code review
- Security scan
- Performance check
- Accessibility audit

### Phase 3: Edge Cases
- Boundary testing
- Error scenarios
- Load testing
- Chaos testing

### Phase 4: Final Verify
- End-to-end tests
- Documentation check
- Deployment verify

## Usage

```
$ultraqa                   # Full QA cycle
$ultraqa src/critical      # Specific module
$ultraqa --phase=automated # Phase only
$ultraqa --strict          # Fail on warnings
```

## Reports

Generates comprehensive report:
```
.omk/qa-reports/ultraqa-{timestamp}.md
```

## Checklist

- [ ] All tests pass
- [ ] Coverage >90%
- [ ] No lint errors
- [ ] Security scan clean
- [ ] Performance baseline met
- [ ] Documentation complete
- [ ] Accessibility compliant

## Comparison

| Skill | Rigorous |
|-------|----------|
| $test | Basic |
| $code-review | Review only |
| $ultraqa | Comprehensive |
