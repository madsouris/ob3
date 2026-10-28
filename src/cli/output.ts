const useUnicode = process.stdout.isTTY === true && process.env['TERM'] !== 'dumb';
const colorEnabled = useUnicode && process.env['NO_COLOR'] === undefined;

const paint = (code: string, text: string): string =>
  colorEnabled ? `\u001B[${code}m${text}\u001B[0m` : text;

export const marks = {
  ok: useUnicode ? '✓' : '[ok]',
  warn: useUnicode ? '!' : '[!]',
  fail: useUnicode ? '✗' : '[x]',
  arrow: useUnicode ? '→' : '->',
} as const;

export const out = {
  line: (message = ''): void => {
    process.stdout.write(`${message}\n`);
  },
  ok: (message: string): void => {
    process.stdout.write(`${paint('32', marks.ok)} ${message}\n`);
  },
  warn: (message: string): void => {
    process.stdout.write(`${paint('33', marks.warn)} ${message}\n`);
  },
  fail: (message: string): void => {
    process.stderr.write(`${paint('31', marks.fail)} ${message}\n`);
  },
  info: (message: string): void => {
    process.stdout.write(`${paint('36', marks.arrow)} ${message}\n`);
  },
  dim: (message: string): void => {
    process.stdout.write(`${paint('2', message)}\n`);
  },
  error: (message: string): void => {
    process.stderr.write(`${paint('31', `ob: ${message}`)}\n`);
  },
};
