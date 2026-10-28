import { createInterface, emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';

export type InitChoice = 'demo' | 'empty' | 'exit';

const CHOICES: ReadonlyArray<{ value: InitChoice; label: string }> = [
  { value: 'demo', label: 'Initialize with Demo Workspace (Recommended - populated sample data)' },
  { value: 'empty', label: 'Initialize Empty Workspace (Folders & default configuration only)' },
  { value: 'exit', label: 'Exit' },
];

/** Maps `1|2|3`, `demo|empty|exit` to a choice; unknown input returns null. */
export function parseChoice(input: string): InitChoice | null {
  const normalized = input.trim().toLowerCase();
  switch (normalized) {
    case '1':
    case 'demo':
      return 'demo';
    case '2':
    case 'empty':
      return 'empty';
    case '3':
    case 'exit':
    case 'q':
      return 'exit';
    default:
      return null;
  }
}

export type WizardOptions = {
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
};

/**
 * The init wizard. Uses an arrow-key selector on a TTY and falls back to a
 * numbered prompt when stdout is redirected (docs/01-cli-and-preflight.md).
 */
export async function chooseInitMode(options: WizardOptions = {}): Promise<InitChoice> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;

  if (!stdin.isTTY) return promptNumbered(stdin, stdout);
  if (!stdout.isTTY) return promptNumbered(stdin, stdout);

  stdout.write('\n Welcome to OperationBegin (ob) — Local-First CRM\n\n');
  stdout.write(' No initialized workspace found. Select setup option:\n\n');
  return selectWithArrows(stdin, stdout);
}

function selectWithArrows(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): Promise<InitChoice> {
  return new Promise((resolve) => {
    let index = 0;

    const render = (first: boolean): void => {
      if (!first) stdout.write(`\u001B[${CHOICES.length}A`);
      CHOICES.forEach((choice, choiceIndex) => {
        const selected = choiceIndex === index;
        const cursor = selected ? '\u001B[36m❯\u001B[0m' : ' ';
        const label = selected ? `\u001B[36m${choice.label}\u001B[0m` : choice.label;
        stdout.write(`\u001B[2K  ${cursor} ${choiceIndex + 1}) ${label}\n`);
      });
    };

    const cleanup = (): void => {
      stdin.off('keypress', onKeypress);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };

    const finish = (choice: InitChoice): void => {
      cleanup();
      resolve(choice);
    };

    const onKeypress = (_sequence: string, key: Key | undefined): void => {
      if (key === undefined) return;
      if (key.name === 'up') {
        index = (index - 1 + CHOICES.length) % CHOICES.length;
        render(false);
      } else if (key.name === 'down') {
        index = (index + 1) % CHOICES.length;
        render(false);
      } else if (key.name === 'return' || key.name === 'enter') {
        finish(CHOICES[index]?.value ?? 'exit');
      } else if (key.name === 'escape' || (key.ctrl === true && key.name === 'c')) {
        finish('exit');
      } else if (key.name !== undefined && /^[1-3]$/.test(key.name)) {
        finish(CHOICES[Number(key.name) - 1]?.value ?? 'exit');
      }
    };

    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', onKeypress);
    render(true);
  });
}

function promptNumbered(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): Promise<InitChoice> {
  CHOICES.forEach((choice, choiceIndex) => {
    stdout.write(`  ${choiceIndex + 1}) ${choice.label}\n`);
  });

  const rl = createInterface({ input: stdin, output: stdout });
  return new Promise<InitChoice>((resolve) => {
    rl.question('\n Select option [1-3]: ', (answer) => {
      rl.close();
      resolve(parseChoice(answer) ?? 'exit');
    });
    rl.once('close', () => resolve('exit'));
  });
}
