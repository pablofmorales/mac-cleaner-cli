# mac-cleaner [DEPRECATED]

> **This project has been deprecated.** We recommend [mole](https://github.com/tw93/mole) instead -- a far more comprehensive, actively maintained macOS system cleaner with 44k+ stars, weekly releases, and a TUI disk analyzer built in.

## Install mole

```bash
brew install mole
```

That's it. Run `mo` to get started.

## Why deprecate?

After evaluating the macOS cleaner landscape, `mole` covers everything `mac-cleaner` did and much more:

| Feature | mac-cleaner | mole |
|---|---|---|
| System/dev cache cleanup | Yes | Yes (30+ ecosystems) |
| Browser cache cleanup | Yes | Yes |
| Docker/Xcode cleanup | Yes | Yes |
| Disk usage analyzer (TUI) | Basic | Full interactive TUI |
| System monitor | Basic status | Real-time dashboard with health score |
| App uninstaller | Partial | Full with associated file discovery |
| Touch ID for sudo | No | Yes |
| Shell completions | No | Yes |
| Homebrew core | No (personal tap) | Yes (`brew install mole`) |

Rather than maintain a less complete tool, we're directing users to the best option available.

## What about security features?

The security and privacy features unique to mac-cleaner (secret scanning, keychain audit, privacy cleanup, secure delete) are being developed as a separate, dedicated tool. Stay tuned.

## Uninstall mac-cleaner

```bash
# If installed via Homebrew
brew uninstall mac-cleaner
brew untap pablofmorales/tap

# If installed via npm
npm uninstall -g @blackasteroid/mac-cleaner-cli
```

---

## License

MIT -- see [LICENSE](LICENSE).
