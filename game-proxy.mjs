import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const manifest = JSON.parse(readFileSync(new URL('./game-manifest.json', import.meta.url), 'utf8'));
const paths = new Set(manifest.files);
const entries = new Map(Object.entries(manifest.entries));
const prefix = '/games/';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.swf': 'application/x-shockwave-flash', '.pdf': 'application/pdf',
};

function contentType(path) {
  const suffix = path.slice(path.lastIndexOf('.')).toLowerCase();
  return mimeTypes[suffix] || 'application/octet-stream';
}

function upstreamUrl(host, path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  if (host === 'cdn') return `https://cdn.jsdelivr.net/gh/tw31122007/HTML-Games-V2@${manifest.commit}/${encoded}`;
  return `https://raw.githubusercontent.com/tw31122007/HTML-Games-V2/${manifest.commit}/${encoded}`;
}

export async function handleGameRequest(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!url.pathname.startsWith(prefix)) return false;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return true;
  }

  let path;
  try { path = decodeURIComponent(url.pathname.slice(prefix.length)); }
  catch { res.writeHead(400).end(); return true; }
  if (path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) {
    res.writeHead(400).end();
    return true;
  }

  const folder = path.replace(/\/$/, '');
  if (entries.has(folder)) {
    res.writeHead(302, { Location: prefix + entries.get(folder).split('/').map(encodeURIComponent).join('/') }).end();
    return true;
  }
  if (!paths.has(path)) {
    res.writeHead(404).end();
    return true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  res.once('close', () => controller.abort());
  try {
    const headers = {};
    if (/^bytes=\d+-\d*$/.test(req.headers.range || '')) headers.Range = req.headers.range;
    let upstream = await fetch(upstreamUrl('cdn', path), { headers, signal: controller.signal });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      upstream = await fetch(upstreamUrl('raw', path), { headers, signal: controller.signal });
    }
    if (!upstream.ok || !upstream.body) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Game asset is temporarily unavailable.');
      return true;
    }
    const responseHeaders = {
      'Content-Type': contentType(path),
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    };
    for (const name of ['content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders[name] = value;
    }
    res.writeHead(upstream.status, responseHeaders);
    if (req.method === 'HEAD') { await upstream.body.cancel(); res.end(); return true; }
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Game asset is temporarily unavailable.');
    else res.destroy(error);
  } finally {
    clearTimeout(timer);
  }
  return true;
}
