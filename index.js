import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import LRU from "lru-cache";

const app = express();
app.use(cors());
const API_KEY = process.env.ROBLOX_API_KEY || "";
const PORT = process.env.PORT || 3000;

// Simple in-memory cache to reduce rate hits
const cache = new LRU({ max: 500, ttl: 1000 * 60 }); // 60s TTL

function okJson(res, status = 200) { return (data) => res.status(status).json(data); }
function errJson(res, status = 500) { return (err) => res.status(status).json({ error: err }); }

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch (e) {
    return { ok: res.ok, status: res.status, data: text };
  }
}

// Helper: fetch all published games (paginated)
async function fetchAllGamesForUser(userId) {
  const results = [];
  let cursor = null;
  do {
    let url = `https://games.roblox.com/v2/users/${encodeURIComponent(userId)}/games?accessFilter=Public&sortOrder=Asc&limit=50`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const { ok, status, data } = await fetchJson(url);
    if (!ok) break;
    if (data && data.data && Array.isArray(data.data)) {
      for (const g of data.data) results.push(g);
      cursor = data.nextPageCursor || null;
    } else break;
    // polite wait avoided on serverless (we rely on caching); calling many users will still be rate-limited by Roblox
  } while (cursor);
  return results;
}

// Helper: fetch game passes for a universe using Cloud API (needs x-api-key)
async function fetchGamePassesForUniverse(universeId) {
  const accum = [];
  let pageToken = null;
  do {
    let url = `https://apis.roblox.com/game-passes/v1/universes/${encodeURIComponent(universeId)}/game-passes?passView=Full&pageSize=100`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const { ok, status, data } = await fetchJson(url, { headers: { "x-api-key": API_KEY } });
    if (!ok) {
      // return an empty list on auth/failure and propagate info to logs
      console.warn("gamepasses fetch failed", universeId, status, data);
      break;
    }
    if (data && Array.isArray(data.gamePasses)) {
      for (const p of data.gamePasses) accum.push(p);
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return accum;
}

// Helper: fetch avatar items (currently wearing + collectibles)
async function fetchAvatarItems(userId) {
  // currently-wearing
  const wearUrl = `https://avatar.roblox.com/v1/users/${encodeURIComponent(userId)}/currently-wearing`;
  const wearResp = await fetchJson(wearUrl);
  const worn = (wearResp.ok && wearResp.data && Array.isArray(wearResp.data.assetIds)) ? wearResp.data.assetIds : [];

  // collectibles (owned)
  const collUrl = `https://avatar.roblox.com/v1/users/${encodeURIComponent(userId)}/assets/collectibles`;
  const collResp = await fetchJson(collUrl);
  let collectibles = [];
  if (collResp.ok && collResp.data && Array.isArray(collResp.data)) {
    collectibles = collResp.data.map(x => ({ id: x.id, name: x.name, price: x.price || 0, creatorTargetId: x.creatorTargetId }));
  } else if (collResp.ok && Array.isArray(collResp.data?.data)) {
    // some endpoints wrap in data.data
    collectibles = collResp.data.data.map(x => ({ id: x.id, name: x.name, price: x.price || 0, creatorTargetId: x.creatorTargetId }));
  }

  // combine and uniq
  const ids = new Set(worn.map(String));
  for (const c of collectibles) ids.add(String(c.id));
  return { worn, collectibles, ids: Array.from(ids) };
}

// Format a pass/asset into the exact old shape your game expects
function formatPassToItem(pass, ownerUserId) {
  const pid = String(pass.gamePassId ?? pass.gamepassId ?? pass.id ?? pass.passId ?? pass.productId ?? "");
  const price = (pass.priceInformation && typeof pass.priceInformation.defaultPriceInRobux === "number")
    ? pass.priceInformation.defaultPriceInRobux
    : (pass.price ?? pass.purchaseInfo?.price ?? 0);

  const iconId = pass.iconAssetId ?? pass.iconAssetId ?? "";
  const imageUrl = iconId and iconId !== "" ? `rbxthumb://type=GamePass&id=${iconId}&w=150&h=150` : (pass.iconUrl || "");

  return {
    ItemName: pass.name ?? pass.displayName ?? ("Gamepass " + pid),
    ItemPrice: price,
    ItemType: "Gamepass",
    ItemId: pid,
    CreatorId: String(pass.creator?.creatorId ?? ownerUserId ?? ""),
    ItemImage: imageUrl
  };
}

function formatAssetToItem(asset) {
  const id = String(asset.id ?? asset.assetId ?? asset.assetId);
  return {
    ItemName: asset.name or ("Asset " + id),
    ItemPrice: asset.price ?? 0,
    ItemType: asset.assetType ?? "Asset",
    ItemId: id,
    CreatorId: String(asset.creatorTargetId ?? asset.creatorId ?? 0),
    ItemImage: `rbxthumb://type=Asset&id=${id}&w=150&h=150`
  };
}

// Unified endpoint: items/:userId
app.get("/items/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId);
    if (!userId) return res.status(400).json({ error: "missing userId" });

    // Cache key per user
    const cacheKey = `items:${userId}`;
    const cached = cache.get(cacheKey);
    if (cached) return okJson(res)(cached);

    // 1) fetch all games for the user
    const games = await fetchAllGamesForUser(userId);

    // 2) for each game pick universeId (robust)
    const universeIds = [];
    for (const g of games) {
      const uni = g.universeId or g.universe or g.id or (g.rootPlace && g.rootPlace.universeId) or (g.rootPlace && g.rootPlace.id);
      if (uni) {
        const s = String(uni);
        if (!universeIds.includes(s)) universeIds.push(s);
      }
    }

    // 3) fetch passes for each universe
    const items = {}; // keyed by ItemId (string)
    for (const uni of universeIds) {
      const passes = await fetchGamePassesForUniverse(uni);
      for (const p of passes) {
        const item = formatPassToItem(p, userId);
        if (item.ItemId and item.ItemId ~= "") items[String(item.ItemId)] = item;
      }
    }

    // 4) fetch avatar items
    const avatar = await fetchAvatarItems(userId);
    // Try to fetch basic data for collectibles if present (we only have id/name sometimes)
    for (const c of avatar.collectibles || []) {
      const itm = {
        ItemName: c.name ?? ("Collectible " + c.id),
        ItemPrice: c.price ?? 0,
        ItemType: "Asset",
        ItemId: String(c.id),
        CreatorId: String(c.creatorTargetId ?? userId),
        ItemImage: `rbxthumb://type=Asset&id=${c.id}&w=150&h=150`
      };
      items[String(itm.ItemId)] = itm;
    }
    // Add worn assets by id (may duplicate)
    for (const id of avatar.ids || []) {
      if (items[String(id)]) continue;
      items[String(id)] = {
        ItemName: "Asset " + id,
        ItemPrice: 0,
        ItemType: "Asset",
        ItemId: String(id),
        CreatorId: userId,
        ItemImage: `rbxthumb://type=Asset&id=${id}&w=150&h=150`
      };
    }

    const out = { items }; // old module expects map keyed by id
    cache.set(cacheKey, out);
    return okJson(res)(out);
  } catch (err) {
    console.error("items handler error", err);
    return errJson(res)(String(err));
  }
});

// quick health check
app.get("/", (req, res) => res.json({ ok: true, version: "roblox-unified-proxy-1" }));

app.listen(PORT, () => console.log(`Proxy listening on ${PORT}`));
