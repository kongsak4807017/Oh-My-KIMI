---
name: security-review
description: Security audit and vulnerability assessment
---

# Security Review Skill

Comprehensive security audit of codebase.

## Use When

- "security review", "security audit", "SEC"
- Handling sensitive data
- Before production deployment
- Compliance requirements

## Security Checklist

### Authentication & Authorization
- [ ] Strong password policies
- [ ] Multi-factor authentication
- [ ] Session management secure
- [ ] Principle of least privilege
- [ ] JWT secrets properly managed

### Data Protection
- [ ] Encryption at rest
- [ ] Encryption in transit (TLS)
- [ ] Sensitive data not logged
- [ ] PII handling compliant
- [ ] Secrets in environment variables

### Input Validation
- [ ] SQL injection prevented
- [ ] XSS prevention
- [ ] CSRF tokens
- [ ] File upload restrictions
- [ ] Rate limiting implemented

### Infrastructure
- [ ] Dependencies updated
- [ ] No hardcoded credentials
- [ ] Secure headers set
- [ ] Error messages don't leak info

## Common Vulnerabilities to Check

| CWE | Description | Check |
|-----|-------------|-------|
| CWE-79 | XSS | Output encoding |
| CWE-89 | SQL Injection | Parameterized queries |
| CWE-200 | Info Exposure | Error handling |
| CWE-287 | Auth Bypass | Access controls |
| CWE-352 | CSRF | Token validation |
| CWE-798 | Hardcoded Credentials | Config management |

## Output Format

```markdown
# Security Review Report

## Risk Summary
- Critical: [N]
- High: [N]
- Medium: [N]
- Low: [N]

## Critical Findings
1. **[CWE-XXX] Title**
   - Location: `file.ts:42`
   - Impact: [Description]
   - Fix: [Recommendation]

## Recommendations
- Immediate actions
- Short-term improvements
- Long-term security posture
```

## Usage

```
$security-review
$security-review src/
$security-review --critical-only
```
