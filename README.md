
# Roblox Proxy for Vercel

**What this is:** a ready-to-deploy Vercel serverless proxy that forwards Roblox Open Cloud, catalog and thumbnail requests via a safe, normalized endpoint. It includes retrying, normalization for common broken URLs, basic in-memory caching, and correct handling of binary (images) and JSON responses — optimized for use with Roblox Studio `HttpService:GetAsync`.

**Files in this project**
- `api/fetch.js` — serverless handler (main proxy)
- `package.json` — Node project file
- `vercel.json` — Vercel config
- `.gitignore`

**Deploy steps (quick)**
1. Zip and upload this project to a GitHub repo or drag-and-drop when creating a new Vercel Project (Import Project → Upload).
2. On Vercel, set **Environment Variable** (Project Settings → Environment Variables):
   - `ROBLOX_API_KEY` (optional) — only needed if you plan to call apis.roblox.com endpoints that require x-api-key. If you use `apis.roproxy.com` passthrough only, it's not required.
3. Deploy. The function will be available at `https://<your-project>.vercel.app/api/fetch`.

**How to use (examples)**

- Pass a Roblox path via `?url=` (URL-encode). Example:
```
GET /api/fetch?url=thumbnails/v1/assets?assetIds=123&size=150x150&format=Png
```
This proxies to `https://apis.roproxy.com/thumbnails/v1/assets?assetIds=123&size=150x150&format=Png` with fixes + caching.

- From Roblox Lua, call:
```lua
local HttpService = game:GetService("HttpService")
local proxy = "https://YOUR_PROJECT.vercel.app/api/fetch?url="
local raw = HttpService:GetAsync(proxy .. HttpService:UrlEncode("thumbnails/v1/assets?assetIds=123&size=150x150&format=Png"))
local data = HttpService:JSONDecode(raw)
```

**Notes**
- This proxy normalizes common broken endpoints, retries transient failures, and caches responses in-memory for short TTLs.
- Vercel serverless instances are ephemeral; the in-memory cache is per-instance. For stronger caching, use an external cache (Redis, Cloudflare, etc.).
- Do not hardcode `ROBLOX_API_KEY` in client code. Use environment variables in Vercel for safety.
