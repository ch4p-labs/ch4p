/**
 * Static file serving for the GUI SPA.
 *
 * Copied from packages/gateway/src/static.ts to avoid pulling in
 * the entire gateway bundle (which imports ws). Zero external deps.
 */

import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, normalize, relative } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/**
 * Try to serve a static file from the given directory.
 * Returns true if served, false to continue to route dispatch.
 */
export function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  staticDir: string,
): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const urlPath = (req.url ?? '/').split('?')[0]!;
  const filePath = urlPath === '/' ? '/index.html' : urlPath;

  const absoluteDir = resolve(staticDir);
  const absoluteFile = resolve(absoluteDir, '.' + normalize(filePath));

  // Prevent directory traversal
  const rel = relative(absoluteDir, absoluteFile);
  if (rel.startsWith('..') || resolve(absoluteFile) !== absoluteFile.replace(/\/$/, '')) {
    return false;
  }

  try {
    const stat = statSync(absoluteFile);
    if (!stat.isFile()) {
      if (!urlPath.startsWith('/api')) return serveFallback(res, absoluteDir);
      return false;
    }
  } catch {
    if (!urlPath.startsWith('/api')) return serveFallback(res, absoluteDir);
    return false;
  }

  const ext = extname(absoluteFile).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

  const isHashed = /\.[a-f0-9]{8,}\.(js|css|woff2?|png|jpg|svg)$/i.test(absoluteFile);
  const cacheControl = isHashed
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=0, must-revalidate';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', cacheControl);

  if (req.method === 'HEAD') {
    res.writeHead(200);
    res.end();
    return true;
  }

  res.writeHead(200);
  pipeFile(absoluteFile, res);
  return true;
}

function pipeFile(absoluteFile: string, res: ServerResponse): void {
  const stream = createReadStream(absoluteFile);
  stream.on('error', (err) => {
    console.warn(`[ch4p-gui] static stream error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

function serveFallback(res: ServerResponse, staticDir: string): boolean {
  const indexPath = resolve(staticDir, 'index.html');
  try {
    statSync(indexPath);
  } catch {
    return false;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.writeHead(200);
  pipeFile(indexPath, res);
  return true;
}
