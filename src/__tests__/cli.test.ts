/**
 * Smoke test for the CLI (bin/starch.js) against the built playground
 * (dist-app/).
 *
 * Runs against the artifact, not the source: it spawns the real CLI as a
 * subprocess, listens for the "listening" line it prints, then makes real
 * HTTP requests against it. Skipped when dist-app hasn't been built; CI
 * builds before testing so it always runs there.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const URL_RE = /(https?:\/\/\S+)/;
const START_TIMEOUT_MS = 15000;

function startCli(args: string[]) {
  const child = spawn(process.execPath, ['bin/starch.js', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const urlPromise = new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout!.on('data', (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(URL_RE);
      if (match) resolve(match[1].trim());
    });
    child.stderr!.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      reject(new Error(`starch CLI exited early (code ${code}). stderr: ${stderr}`));
    });
  });

  const timeout = new Promise<string>((_, reject) => {
    setTimeout(
      () => reject(new Error('timed out waiting for starch CLI to print its URL')),
      START_TIMEOUT_MS
    );
  });

  return { child, urlReady: Promise.race([urlPromise, timeout]) };
}

async function stop(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
}

describe.skipIf(!existsSync('dist-app/index.html'))('starch CLI', () => {
  it('serves the playground and rejects unsafe paths', async () => {
    const { child, urlReady } = startCli(['--no-open', '--port', '0']);

    try {
      const url = await urlReady;

      const indexRes = await fetch(url);
      expect(indexRes.status).toBe(200);
      expect(indexRes.headers.get('content-type')).toContain('text/html');
      const body = await indexRes.text();
      expect(body).toContain('<script');

      const missingRes = await fetch(`${url}this-path-does-not-exist.js`);
      expect(missingRes.status).toBe(404);

      // fetch() normalizes ../ dot segments before sending the request, so a
      // literal traversal attempt never reaches the server that way. Encode
      // it so it survives to the server's own path resolution instead.
      const traversalRes = await fetch(`${url}%2e%2e/package.json`);
      expect(traversalRes.status).not.toBe(200);
      expect([403, 404]).toContain(traversalRes.status);
    } finally {
      await stop(child);
    }
  });
});
