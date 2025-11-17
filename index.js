import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Fetch gamepasses
app.get("/gamepasses/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    // Replace with actual Roblox API URL
    const url = `https://apis.roblox.com/game-passes/v1/universes/${userId}/game-passes/creator`;
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send({ error: "Failed to fetch gamepasses" });
    const data = await response.json();
    // Format like your previous script expects
    const gamePasses = (data.gamePasses || []).map(pass => ({
      id: pass.gamePassId,
      name: pass.name,
      price: pass.priceInformation?.defaultPriceInRobux || 0
    }));
    res.json({ gamePasses });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// Fetch avatar assets
app.get("/avatar/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const url = `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`;
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send({ error: "Failed to fetch avatar" });
    const data = await response.json();
    // Return the IDs of currently worn assets
    res.json({ items: data.assetIds || [] });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
