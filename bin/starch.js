#!/usr/bin/env node
// Zero-dependency CLI: serves the built playground app (dist-app/) locally.
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const USAGE = `Usage: starch [options]

Serves the Starch playground locally.

Options:
  --port <n>   Port to listen on (default: 4600; 0 picks a free port)
  --no-open    Don't open the browser automatically
  -h, --help   Show this help
`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

function parseArgs(argv) {
  const opts = { port: 4600, portExplicit: false, open: true, attempt: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--no-open') {
      opts.open = false;
    } else if (arg === '--port') {
      const value = argv[++i];
      const port = Number(value);
      if (value === undefined || !Number.isInteger(port) || port < 0 || port > 65535) {
        process.stderr.write(`Invalid --port value: ${value}\n\n${USAGE}`);
        process.exit(1);
      }
      opts.port = port;
      opts.portExplicit = true;
    } else {
      process.stderr.write(`Unknown option: ${arg}\n\n${USAGE}`);
      process.exit(1);
    }
  }
  return opts;
}

function openBrowser(url) {
  const platform = process.platform;
  const [cmd, args] =
    platform === 'darwin'
      ? ['open', [url]]
      : platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch {
    // best-effort only
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const root = fileURLToPath(new URL('../dist-app/', import.meta.url));
  if (!existsSync(path.join(root, 'index.html'))) {
    process.stderr.write(
      'playground build not found — in a dev checkout run: npm run build:app\n'
    );
    process.exit(1);
  }

  const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }
    if (pathname === '/') pathname = '/index.html';

    const filePath = path.resolve(root, '.' + pathname);
    if (filePath !== path.resolve(root) && !filePath.startsWith(path.resolve(root) + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.destroy();
    });
    stream.pipe(res);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !opts.portExplicit && opts.attempt < 20) {
      opts.attempt += 1;
      opts.port += 1;
      server.listen(opts.port, listenCallback);
      return;
    }
    if (err.code === 'EADDRINUSE') {
      process.stderr.write(
        opts.portExplicit
          ? `Port ${opts.port} is already in use. Try a different --port.\n`
          : `Could not find a free port after 20 attempts.\n`
      );
      process.exit(1);
    }
    process.stderr.write(`Server error: ${err.message}\n`);
    process.exit(1);
  });

  let announced = false;
  function listenCallback() {
    // Each listen() attempt registers this callback again; after an
    // EADDRINUSE retry the earlier registrations fire too, so announce once.
    if (announced) return;
    announced = true;
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : opts.port;
    const url = `http://localhost:${port}/`;
    process.stdout.write(`Starch playground → ${url}\n`);
    if (opts.open) openBrowser(url);
  }

  server.listen(opts.port, listenCallback);
}

main();
