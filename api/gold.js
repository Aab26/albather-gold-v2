// /api/gold.js
export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    // Fetch gold price in USD per ounce
    const metalRes = await fetch("https://api.metals.live/v1/spot");
    const metalData = await metalRes.json();
    const goldUSD = metalData?.[0]?.gold;
    if (!goldUSD) throw new Error("Gold price unavailable");

    // Fetch USD→KWD exchange rate (fallback-safe)
    let usdToKwd;
    try {
      const fxRes = await fetch("https://open.er-api.com/v6/latest/USD");
      const fxData = await fxRes.json();
      usdToKwd = fxData?.rates?.KWD;
      if (!usdToKwd || typeof usdToKwd !== "number") throw new Error("Bad rate");
    } catch (e) {
      // fallback fixed rate in case the API is offline
      usdToKwd = 0.308; // approximate USD→KWD
    }

    // Convert ounce → gram (1 troy oz = 31.1034768 g)
    const kwdPerGram24 = (goldUSD * usdToKwd) / 31.1034768;
    const prices = {
      k24: kwdPerGram24.toFixed(3),
      k22: (kwdPerGram24 * 22 / 24).toFixed(3),
      k21: (kwdPerGram24 * 21 / 24).toFixed(3),
      k18: (kwdPerGram24 * 18 / 24).toFixed(3)
    };

    return new Response(JSON.stringify({
      prices,
      updated: new Date().toISOString(),
      source: "metals.live × open.er-api.com"
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=15"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      detail: "fetch failed"
    }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
