# Contribution Rules

These rules apply to all igorjs projects. They cover the legal requirements (DCO + CLA), commit conventions, PR process, and the **code style baseline** that every project shares. Project-specific build commands, runtime requirements, and language-specific style rules live in each project's [README](../README.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).

## Before You Start

1. **Check existing issues** to see if someone is already working on what you want to change.
2. **Open an issue first** for significant changes (new modules, API changes, architecture). Small fixes and documentation improvements can go straight to a PR.
3. **Read the [Code of Conduct](../CODE_OF_CONDUCT.md).**

## Requirements

Every contribution must satisfy two legal requirements.

### 1. Developer Certificate of Origin (DCO)

All commits must include a `Signed-off-by` trailer certifying that you have the right to submit the code. Add it with:

```bash
git commit --signoff -m "your commit message"
```

This adds a line like:

```
Signed-off-by: Your Name <your@email.com>
```

The DCO check runs on every PR. If any commit is missing the trailer, the bot will comment with instructions. Amend with `git commit --amend --signoff` and force-push.

### 2. Contributor License Agreement (CLA)

First-time contributors must sign a CLA. This grants the project a license to use your contribution and protects both you and the project.

**Individual contributors:** Sign the [Individual CLA](ICLA.md) by commenting on your first PR with:

```
I have read the CLA Document and I hereby sign the CLA.
```

The CLA bot will record your signature in [CONTRIBUTORS.md](CONTRIBUTORS.md). You only need to do this once across all repositories maintained by igorjs.

**Corporate contributors:** If you are contributing on behalf of your employer, your organisation must sign the [Corporate CLA](CCLA.md). Email the signed document to oss@mail.igorjs.io. Individual employees listed as Designated Employees do not need to sign the Individual CLA separately.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): short imperative summary
fix(scope): short imperative summary
docs: update X
test: add Y coverage
chore: housekeeping
ci: build/release changes
refactor: no behaviour change
perf: performance improvement
```

Always sign commits: `git commit --signoff --gpg-sign`. The `--signoff` is mandatory for DCO; GPG signing is strongly preferred for verifiability.

## Pull Request Process

1. Fork the repository and create a branch from `main`.
2. Make your changes with tests.
3. Ensure all checks pass locally (see the project's [README](../README.md) for the specific commands).
4. Sign the CLA (first-time only).
5. Submit a PR using the project's PR template.
6. Address review feedback.

## Code Style: Baseline

These rules apply to every igorjs project. Language-specific patterns (TypeScript naming, Rust idioms, framework conventions) live in each project's `CONTRIBUTING.md`.

### License Header

Every source file must start with an SPDX license header identifying the project's license. The header syntax varies by language:

```
// Copyright 2026 igorjs. SPDX-License-Identifier: <PROJECT_LICENSE>          (TypeScript, JavaScript, Rust, C, C++, Go, Java)
# Copyright 2026 igorjs. SPDX-License-Identifier: <PROJECT_LICENSE>           (bash, Python, Ruby, YAML, Dockerfile)
<!-- Copyright 2026 igorjs. SPDX-License-Identifier: <PROJECT_LICENSE> -->    (HTML, Markdown, XML)
```

Replace `<PROJECT_LICENSE>` with the SPDX identifier from the project's [LICENSE](../LICENSE) file (e.g. `Apache-2.0`, `AGPL-3.0`). The pre-commit hook in each project adds missing headers to new source files automatically.

### Dependency Policy

- **Minimise new runtime dependencies.** Each new dependency increases the supply chain attack surface and the maintenance burden.
- **Justify each new dependency in the PR description**: what problem it solves, what alternatives were considered, and why this one is the right trade-off.
- **Prefer widely audited libraries** over niche ones. Active maintenance, security responsiveness, and license compatibility are non-negotiable.
- **Pin dependencies to specific versions.** Never use floating ranges (`^`, `~`, `*`) in lockfiles. Dependabot handles version updates via reviewable PRs.
- **Dev dependencies have a lower bar than runtime dependencies** but the justification step still applies.

### Commit Signing

Beyond DCO `--signoff` (mandatory), GPG signing is strongly preferred:

```bash
git commit --signoff --gpg-sign -m "your commit message"
```

The "Require signed commits" ruleset rejects unsigned commits on `main` for projects that enable it. Set up GPG signing once via `git config --global user.signingkey <KEY_ID>` and you're done.

### Branch Protection Bypass

Force-pushing to `main` is blocked for everyone except repo admins. If you need to rewrite history (rare), open a PR with the rewritten history rather than force-pushing.

## Reporting Bugs

Open a GitHub issue using the **Bug Report** template. Include:

- The version of the project you're running.
- Your operating system, runtime, and any other relevant environment context.
- A minimal reproduction (smallest code, commands, or steps that trigger the bug).
- Expected vs actual behaviour.
- Full error message or stack trace if applicable.

## Reporting Security Vulnerabilities

Do **not** open a public issue for security vulnerabilities. See [SECURITY.md](../SECURITY.md) for responsible disclosure instructions (GitHub Security Advisories or email).

## License

By contributing, you agree that your contributions will be licensed under the project's license (see [LICENSE](../LICENSE)), subject to the terms of the [Individual CLA](ICLA.md) or [Corporate CLA](CCLA.md).
