# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

To report a vulnerability, use one of:

- **GitHub Security Advisories**: [Report a vulnerability](https://github.com/igorjs/gh-actions-clean-workflow/security/advisories/new)
- **Email**: **oss@mail.igorjs.io**

Include:

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Impact assessment (what can an attacker do?)
- Suggested fix (if you have one)

### What to expect

- **Acknowledgement** within 48 hours
- **Assessment** within 7 days (severity, affected scope, fix plan)
- **Fix and disclosure** within 30 days for critical issues, 90 days for others

If the report is accepted, you will be credited in the release notes (unless you prefer anonymity).

If the report is declined (not a vulnerability, or out of scope), you will receive an explanation and may open a public issue.

## Supported Versions

| Version | Supported |
|---------|-----------|
| `v7` (latest) | Yes |
| earlier | No |

Only the latest released version (`v7`) receives security patches. Upgrade to the latest version before reporting.

## Scope

### In scope

Vulnerabilities in this repository's code, including but not limited to:

- Code execution, injection, or memory safety issues
- Cryptographic weaknesses
- Authentication or authorisation bypasses
- Denial of service via crafted input
- Bypass of any documented security guarantees (sandbox, isolation, etc.)
- Compromise of the build, release, or signing pipeline (where applicable)

### Out of scope

- Vulnerabilities in third-party dependencies (report to the upstream maintainer)
- Issues that require an attacker to already have admin or write access to this repository
- Theoretical issues without a practical exploit path
- Social engineering attacks
- Issues requiring physical access to the user's machine
- Bugs in development-only tooling not shipped to end users

## Hardening posture

This repository is part of the `igorjs` repo set and follows a common
hardening posture: ruleset-managed branch and tag protection, signed
commits, SHA-pinned third-party actions, and an App-based bot identity
with narrow per-repo scope. For the cross-repo configuration as code,
see the [`repo-config`](https://github.com/igorjs/repo-config) repo.
