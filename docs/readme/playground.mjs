/**
 * Screenshots the playground for the README, driving a headless Chrome over
 * the DevTools protocol (no puppeteer, no dependencies). Run through
 * ./build.sh, which builds and serves the app first. Standalone:
 *
 *   node docs/readme/playground.mjs http://localhost:4600/ out.png
 *
 * The page opens on its default sample, so the shot is taken a few seconds
 * into playback — by then the diagram has drawn itself in full and the
 * transport shows a real position on the timeline.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: playground.mjs <url> <out.png>');
  process.exit(1);
}

const CHROME = process.env.CHROME_BIN ?? 'google-chrome';
const PORT = 9333;
/** Seconds into the animation to capture — past the last keyframe (2.7s). */
const AT = 3.4;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'starch-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=2',
  '--window-size=1440,900',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Chrome needs a moment before its debugging port answers. */
async function debuggerUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = tabs.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('headless Chrome never opened its debugging port');
}

try {
  const ws = new WebSocket(await debuggerUrl());
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  });
  const send = (method, params = {}) => new Promise(resolve => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await new Promise(resolve => ws.addEventListener('open', resolve));

  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(2500);
  await send('Runtime.evaluate', { expression: `document.querySelector('.ctrl-btn').click()` });
  await sleep(AT * 1000);

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`shot   ${out}`);
} finally {
  chrome.kill();
  // Chrome flushes its profile on the way out; give it a beat, then treat
  // whatever is left in the temp dir as the OS's problem.
  await new Promise(resolve => chrome.once('exit', resolve));
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* leave it */ }
}
