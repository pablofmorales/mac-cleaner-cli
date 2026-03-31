# Security Policy

## Supported versions

We actively maintain the latest major release. Older versions do not receive security fixes.

| Version | Supported |
|---------|-----------|
| Latest  | ✅        |
| Older   | ❌        |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report them privately by emailing the maintainers or opening a [private security advisory](https://github.com/pablofmorales/mac-cleaner-cli/security/advisories/new) on GitHub.

Please include:
- A clear description of the vulnerability
- Steps to reproduce
- The potential impact
- Any suggested fix (optional)

We will acknowledge your report within 48 hours and work with you on a fix before any public disclosure.

## Security design

- All shell commands use `spawnSync` with explicit argument arrays — no shell string interpolation, no injection risk.
- Sudo passwords are collected via masked terminal input, passed to processes via `stdin`, and immediately zeroized in memory after use (`Buffer.fill(0)`).
- Only paths in a strict predefined allowlist can be deleted with elevated privileges.
- Symlink escape protection: all paths are resolved via `fs.realpathSync` before deletion.
- Version strings from the npm registry are validated against a semver regex before use.
- No credentials, tokens, or passwords are written to disk, logs, or JSON output.
