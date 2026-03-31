# Contributing to mac-cleaner

Thanks for taking the time to contribute. Here's what you need to know.

## Getting started

```bash
git clone https://github.com/pablofmorales/mac-cleaner-cli.git
cd mac-cleaner-cli
npm install
npm run build
```

Run `mac-cleaner --help` to confirm the build works.

## Development workflow

1. **Open an issue first** — before writing code, open an issue to discuss what you want to change. This saves everyone time.
2. **One branch per issue** — name it `feat/issue-N-short-description` or `fix/issue-N-short-description`.
3. **Write tests** — every new feature or bug fix needs a test in `src/cleaners/*.test.ts`.
4. **Run the build** before pushing:
   ```bash
   npm run build
   npm test
   ```
5. **Open a PR** that closes the issue.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use for |
|--------|---------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `chore:` | Tooling, deps, no logic change |
| `docs:` | Documentation only |
| `refactor:` | Refactoring without behavior change |
| `test:` | Adding or updating tests |

Examples:
```
feat(node): detect orphan node_modules in monorepos
fix: add timeout to spawnSync in brew cleaner
docs: update README with --secure-delete flag
```

## Code style

- TypeScript strict mode — no `any` without a comment explaining why.
- Use `spawnSync` (not `execSync`) for shell commands — explicit arg arrays, no string interpolation.
- All file paths must use `os.homedir()` — never hardcode usernames.
- Add `timeout` to every `spawnSync` call.
- Async functions for anything that prompts the user (sudo, etc.).

## Adding a new cleaner

1. Create `src/cleaners/<name>.ts` that exports `clean(options: CleanOptions): Promise<CleanResult>`.
2. Add it to `src/cleaners/all.ts` so it runs in `mac-cleaner all`.
3. Register it in `src/index.ts` as both `clean <name>` and the `<name>` shorthand.
4. Add it to the help formatter in `src/utils/helpFormatter.ts`.
5. Write tests in `src/cleaners/<name>.test.ts`.

## Security

If you find a security vulnerability, **do not open a public issue**. See [SECURITY.md](SECURITY.md).

## Questions

Open a [GitHub Discussion](https://github.com/pablofmorales/mac-cleaner-cli/discussions) for anything that isn't a bug or feature request.
