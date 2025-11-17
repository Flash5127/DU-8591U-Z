export default async function handler(req, res) {
  const { universeId } = req.query;

  if (!universeId) {
    return res.status(400).json({ error: "Missing universeId" });
  }

  try {
    const response = await fetch(
      `https://apis.roblox.com/game-passes/v1/universes/${universeId}/game-passes/creator`,
      {
        headers: {
          "x-api-key": process.env.ROBLOX_API_KEY
        }
      }
    );

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
