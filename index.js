
import express from "express";
import fetch from "node-fetch";
const app = express();

app.get("/games/:userId", async (req, res) => {
  try {
    const r = await fetch(
      `https://games.roblox.com/v2/users/${req.params.userId}/games?accessFilter=Public&sortOrder=Asc&limit=50`
    );
    const data = await r.json();
    res.json(data);
  } catch (e) {
     res.status(500).json({ error: e.toString() });
  }
});

app.get("/gamepasses/:universeId", async (req, res) => {
  try {
    const r = await fetch(
      `https://apis.roblox.com/cloud/v2/universes/${req.params.universeId}/game-passes?limit=100`,
      {
        headers: {
          "x-api-key": process.env.ROBLOX_API_KEY || ""
        }
      }
    );
    const data = await r.json();
    res.json(data);
  } catch (e) {
     res.status(500).json({ error: e.toString() });
  }
});

app.get("/avatar/:userId", async (req, res) => {
  try {
    const r = await fetch(
      `https://avatar.roblox.com/v1/users/${req.params.userId}/outfits`
    );
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.listen(3000);
