import { spawn } from 'node:child_process';

/**
 * Opens a URL in the default browser. Best-effort: a failure is logged by the
 * caller as a warning, never as a fatal error (headless machines exist).
 */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): boolean {
  const { command, args } =
    platform === 'darwin'
      ? { command: 'open', args: [url] }
      : platform === 'win32'
        ? { command: 'cmd', args: ['/c', 'start', '', url] }
        : { command: 'xdg-open', args: [url] };

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}
