
import fetch from 'node-fetch';
import LRU from 'lru-cache';

/*
  Vercel serverless proxy for Roblox APIs.
  Usage: /api/fetch?url=<path...>&mode=roproxy|direct
  - url: the path portion to append to the upstream base
    e.g. thumbnails/v1/assets?assetIds=123&size=150x150
  - mode (optional): 'roproxy' (default) uses https://apis.roproxy.com/
                      'direct' uses https://apis.roblox.com/ (requires ROBLOX_API_KEY env)
*/

const CACHE_TTL = 60 * 1000; // 60s default cache TTL
const cache = new LRU({ max: 1000, ttl: CACHE_TTL });

const DEFAULT_UPSTREAM = 'https://apis.roproxy.com/';
const DIRECT_UPSTREAM = 'https://apis.roblox.com/';
const CATALOG_UPSTREAM = 'https://catalog.roblox.com/';
const THUMBNAIL_UPSTREAM = 'https://thumbnails.roblox.com/';

function safeJoin(base, tail) {
  if (!tail) return base;
  // remove leading slashes
  tail = tail.replace(/^\/+/, '');
  return base + tail;
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        // treat 5xx as retryable, but 4xx are permanent
        if (res.status >= 500 && i < attempts - 1) {
          lastErr = new Error(`Upstream ${res.status}`);
          continue;
        }
      }
      return res;
    } catch (e) {
      lastErr = e;
      // small backoff
      await new Promise(r => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw lastErr;
}

export default async function handler(req, res) {
  const q = req.query;
  const rawUrl = Array.isArray(q.url) ? q.url.join('') : (q.url || '');
  if (!rawUrl) {
    res.status(400).json({ ok:false, error: 'Missing ?url=' });
    return;
  }

  // mode: prefer roproxy passthrough which avoids needing API key
  const mode = (q.mode || 'roproxy').toLowerCase();
  let upstreamBase = DEFAULT_UPSTREAM;
  if (mode === 'direct') upstreamBase = DIRECT_UPSTREAM;

  // Simple normalization/fixes for common mistakes
  let normalized = rawUrl;
  normalized = normalized.replace(/^https?:\/\//i, ''); // drop protocols if sent full URL
  normalized = normalized.replace(/^api\.roblox\.com\/?/i, ''); // strip old host if included
  normalized = normalized.replace(/^www\./i, '');

  // Choose upstream based on obvious path prefixes
  if (/^catalog\./i.test(normalized) || normalized.startsWith('catalog/')) {
    upstreamBase = CATALOG_UPSTREAM;
  } else if (/^thumbnails\./i.test(normalized) || normalized.startsWith('thumbnails/')) {
    upstreamBase = THUMBNAIL_UPSTREAM;
  } else if (mode === 'direct') {
    upstreamBase = DIRECT_UPSTREAM;
  } else {
    upstreamBase = DEFAULT_UPSTREAM;
  }

  const upstreamUrl = safeJoin(upstreamBase, normalized);
  const cacheKey = `GET:${upstreamUrl}`;

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      // return cached response (already contains headers/bodyNormalized)
      res.setHeader('x-cache', 'HIT');
      for (const [k,v] of Object.entries(cached.headers||{})) {
        if (v) res.setHeader(k, v);
      }
      if (cached.isBinary) {
        res.status(200).send(Buffer.from(cached.body, 'base64'));
      } else {
        res.status(200).send(cached.body);
      }
      return;
    }

    const headers = {};
    // If direct and API key present, forward x-api-key
    if (process.env.ROBLOX_API_KEY && upstreamBase.includes('roblox.com')) {
      headers['x-api-key'] = process.env.ROBLOX_API_KEY;
    }

    // Fetch with retry
    const upstreamRes = await fetchWithRetry(upstreamUrl, { headers, redirect: 'follow' }, 3);

    // Collect response
    const contentType = upstreamRes.headers.get('content-type') || '';
    const isBinary = !contentType.includes('application/json') && (contentType.includes('image') || contentType.includes('octet-stream'));

    let bodyToSend;
    if (isBinary) {
      const arr = await upstreamRes.arrayBuffer();
      const b = Buffer.from(arr);
      bodyToSend = b.toString('base64'); // store base64 in cache
      // respond with binary buffer
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.setHeader('x-cache', 'MISS');
      res.status(upstreamRes.status).send(b);
    } else {
      const text = await upstreamRes.text();
      bodyToSend = text;
      res.setHeader('Content-Type', contentType || 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.setHeader('x-cache', 'MISS');
      res.status(upstreamRes.status).send(text);
    }

    // Store in cache (small normalized object)
    cache.set(cacheKey, {
      headers: { 'content-type': contentType },
      isBinary,
      body: bodyToSend
    });

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ ok:false, error: 'Upstream proxy failure', details: String(err.message || err) });
  }
}
