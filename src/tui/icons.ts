export type IconSetName = "unicode" | "nerd";

interface IconSet {
  bullet: string;
  success: string;
  error: string;
  warn: string;
  info: string;
  checkbox_on: string;
  checkbox_off: string;
  arrow: string;
  dot: string;
  folder: string;
  file: string;
  scan: string;
  clean: string;
  settings: string;
  dashboard: string;
}

const iconSets: Record<IconSetName, IconSet> = {
  unicode: {
    bullet: ">",
    success: "+",
    error: "x",
    warn: "!",
    info: "i",
    checkbox_on: "[x]",
    checkbox_off: "[ ]",
    arrow: "->",
    dot: ".",
    folder: "/",
    file: "-",
    scan: "~",
    clean: "*",
    settings: "#",
    dashboard: "=",
  },
  nerd: {
    bullet: "\uf054",
    success: "\uf00c",
    error: "\uf00d",
    warn: "\uf071",
    info: "\uf05a",
    checkbox_on: "\uf046",
    checkbox_off: "\uf096",
    arrow: "\uf061",
    dot: "\uf111",
    folder: "\uf07b",
    file: "\uf15b",
    scan: "\uf002",
    clean: "\uf1b8",
    settings: "\uf013",
    dashboard: "\uf0e4",
  },
};

let currentSet: IconSetName = "unicode";

export function getIconSet(): IconSetName {
  const envSet = process.env.MAC_CLEANER_ICONS;
  if (envSet === "nerd") return "nerd";
  return currentSet;
}

export function setIconSet(name: IconSetName): void {
  currentSet = name;
}

export function getIcon(name: keyof IconSet): string {
  return iconSets[getIconSet()][name];
}

export function getAllIcons(): IconSet {
  return iconSets[getIconSet()];
}
