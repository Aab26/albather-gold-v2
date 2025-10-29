// /api/gold.js
export default async function handler(req, res) {
  try {
    // 1. Fetch gold price in USD per ounce
    const metalRes = await fetch("https://api.metals.live/v1/spot");
    const metalData = await metalRes.json();
    const goldUSD = metalData?.[0]?.gold;
    if (!goldUSD) throw new Error("Invalid gold data");

    // 2. Fetch USD→KWD exchange rate
    const fxRes = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=KWD");
    const fxData = await fxRes.json();
    const usdToKwd = fxData?.rates?.KWD;
    if (!usdToKwd) throw new Error("Invalid currency rate");

    // 3. Convert ounce → gram and calculate karats
    const gram24 = (goldUSD * usdToKwd) / 31.1034768;
    const prices = {
      k24: (gram24 * 1.00).toFixed(3),
      k22: (gram24 * 22 / 24).toFixed(3),
      k21: (gram24 * 21 / 24).toFixed(3),
      k18: (gram24 * 18 / 24).toFixed(3)
    };

    // 4. Return JSON response
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      prices,
      source: "metals.live × exchangerate.host",
      updated: new Date().toISOString()
    });

  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}
