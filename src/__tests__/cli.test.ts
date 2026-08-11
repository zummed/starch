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
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

/**
 * Runs `starch check` against the built library the same way a user would.
 * Documents go in on stdin so the test needs no fixture files.
 */
async function check(source: string, args: string[] = []) {
  const child = execFileAsync(process.execPath, ['bin/starch.js', 'check', '-', ...args]);
  child.child.stdin!.end(source);
  try {
    const { stdout, stderr } = await child;
    return { code: 0, stdout, stderr };
  } catch (err: any) {
    return { code: err.code as number, stdout: err.stdout as string, stderr: err.stderr as string };
  }
}

describe.skipIf(!existsSync('dist/starch.js'))('starch check', () => {
  it('accepts a valid document', async () => {
    const result = await check('a: rect 100x50 fill steelblue at 60,60\n');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('ok');
  });

  it('fails a document whose shape name is misspelled', async () => {
    const result = await check('api: bax "API" color=steelblue\n');
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/"api" has no properties/i);
  });

  it('fails a document that is not starch at all', async () => {
    const result = await check('!!! not starch ???\n');
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/zero nodes/i);
  });

  it('emits machine-readable results with --json', async () => {
    const result = await check('bad: nothing here\n', ['--json']);
    expect(result.code).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.results[0].warnings[0]).toMatch(/has no properties/i);
  });
});

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
