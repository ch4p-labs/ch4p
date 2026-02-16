/**
 * Static file serving for the canvas web UI.
 *
 * Serves files from a given directory with proper Content-Type headers.
 * Prevents directory traversal attacks. Uses Node.js built-in modules only.
 */

import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, normalize, relative } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** MIME type map for common web assets. */
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
 *
 * Returns `true` if a file was found and served, `false` if not.
 * When returning `false`, the caller should proceed with normal routing.
 */
export function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  staticDir: string,
): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const urlPath = (req.url ?? '/').split('?')[0]!;

  // Map / to /index.html
  const filePath = urlPath === '/' ? '/index.html' : urlPath;

  // Resolve and normalize to prevent directory traversal
  const absoluteDir = resolve(staticDir);
  const absoluteFile = resolve(absoluteDir, '.' + normalize(filePath));

  // Ensure the resolved path is within the static directory
  const rel = relative(absoluteDir, absoluteFile);
  if (rel.startsWith('..') || resolve(absoluteFile) !== absoluteFile.replace(/\/$/, '')) {
    return false;
  }

  // Check if the file exists and is a file (not directory)
  try {
    const stat = statSync(absoluteFile);
    if (!stat.isFile()) {
      // For SPA routing: if path doesn't match a file, serve index.html
      // But only for paths that don't look like API routes
      if (!urlPath.startsWith('/api') && !urlPath.startsWith('/ws')) {
        return serveFallback(res, absoluteDir);
      }
      return false;
    }
  } catch {
    // File not found — try SPA fallback for non-API routes
    if (!urlPath.startsWith('/api') && !urlPath.startsWith('/ws') && !urlPath.startsWith('/health') && !urlPath.startsWith('/pair') && !urlPath.startsWith('/sessions')) {
      return serveFallback(res, absoluteDir);
    }
    return false;
  }

  // Determine content type
  const ext = extname(absoluteFile).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

  // Set cache headers (assets with hashes can be cached longer)
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
  createReadStream(absoluteFile).pipe(res);
  return true;
}

/** Serve index.html as a fallback for SPA client-side routing. */
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
  createReadStream(indexPath).pipe(res);
  return true;
}
