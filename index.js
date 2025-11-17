import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const API_KEY = process.env.ROBLOX_API_KEY;

// Gamepasses endpoint
app.get("/gamepasses/:universeId", async (req, res) => {
  const universeId = req.params.universeId;
  const url = `https://apis.roblox.com/game-passes/v1/universes/${universeId}/game-passes?passView=Full&pageSize=100`;

  try {
    const resp = await fetch(url, {
      headers: { "x-api-key": API_KEY },
    });
    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json({ error: data, status: resp.status });
    }

    // Map to what your game expects
    const passes = (data.gamePasses || []).map(p => {
      return {
        id: p.gamePassId,
        name: p.name,
        price: p.priceInformation?.defaultPriceInRobux ?? 0
      };
    });

    return res.json({ gamePasses: passes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// (avatar part unchanged)
app.get("/avatar/:userId", async (req, res) => {
  // your avatar logic
  const userId = req.params.userId;
  const url = `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`;
  try {
    const r = await fetch(url);
    const d = await r.json();
    return res.json({ items: d.assetIds || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Proxy running");
});
