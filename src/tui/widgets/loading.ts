import blessed from "neo-blessed";
import { getTheme } from "../theme.js";

export interface LoadingOverlay {
  element: blessed.Widgets.BoxElement;
  update: (message: string) => void;
  destroy: () => void;
}

const spinnerFrames = ["|", "/", "-", "\\"];

export function createLoadingOverlay(
  parent: blessed.Widgets.Screen,
  title: string,
  initialMessage: string,
): LoadingOverlay {
  const theme = getTheme();

  const box = blessed.box({
    parent,
    top: "center",
    left: "center",
    width: 50,
    height: 7,
    border: { type: "line" },
    style: {
      border: { fg: theme.info },
      bg: "black",
    },
    tags: true,
    label: ` ${title} `,
  });

  let frameIdx = 0;
  let message = initialMessage;

  function render(): void {
    const spinner = spinnerFrames[frameIdx % spinnerFrames.length];
    box.setContent(
      `\n  {${theme.info}-fg}${spinner}{/${theme.info}-fg}  ${message}\n\n  {${theme.textDim}-fg}Please wait...{/${theme.textDim}-fg}`,
    );
    parent.render();
  }

  render();

  const interval = setInterval(() => {
    frameIdx++;
    render();
  }, 150);

  return {
    element: box,
    update(msg: string) {
      message = msg;
      render();
    },
    destroy() {
      clearInterval(interval);
      box.detach();
      parent.render();
    },
  };
}
