export default async function handler(req, res) {
  const { endpoint } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: "Missing endpoint parameter" });
  }

  try {
    const response = await fetch(`https://apis.roblox.com/${endpoint}`, {
      headers: {
        "x-api-key": process.env.ROBLOX_API_KEY
      }
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}