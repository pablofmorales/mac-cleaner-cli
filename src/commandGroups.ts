export interface CommandGroupDef {
  description: string;
  commands: string[];
}

export const COMMAND_GROUPS: Record<string, CommandGroupDef> = {
  cleanup: {
    description: "Clean caches, logs, and junk files to free disk space",
    commands: ["system", "brew", "node", "browser", "docker", "xcode", "cloud", "mail", "mobile-backups", "all"],
  },
  protection: {
    description: "Security audits and privacy cleanup",
    commands: ["privacy", "keychain", "scan"],
  },
  speed: {
    description: "Performance tuning and system maintenance",
    commands: ["maintain", "startup"],
  },
  applications: {
    description: "Manage leftover files from uninstalled apps",
    commands: ["apps"],
  },
  files: {
    description: "Find, analyze, and clean up files",
    commands: ["large-files", "duplicates", "disk-usage"],
  },
};

export function getGroupForCommand(cmd: string): string | undefined {
  for (const [group, def] of Object.entries(COMMAND_GROUPS)) {
    if (def.commands.includes(cmd)) return group;
  }
  return undefined;
}
