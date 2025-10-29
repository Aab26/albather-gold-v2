// /api/gold.js
export default async function handler(req, res) {
  try {
    // Helper to fetch JSON
    const fetchJson = async (url) => {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    };

    // 1️⃣  Try to get gold in USD/oz from several sources
    let usdPerOz;
    try {
      const metals = await fetchJson("https://api.metals.live/v1/spot");
      usdPerOz = metals?.[0]?.gold;
      if (!usdPerOz) throw new Error("no gold");
    } catch {
      try {
        const alt = await fetchJson("https://data-asg.goldprice.org/dbXRates/USD");
        usdPerOz = alt?.items?.[0]?.xauPrice;
      } catch {
        usdPerOz = 2370; // fallback
      }
    }

    // 2️⃣  Get USD→KWD with multi-fallbacks
    let usdToKwd;
    const tryFX = async (url, path) => {
      const j = await fetchJson(url);
      return path.split(".").reduce((v, k) => v?.[k], j);
    };
    const fxUrls = [
      ["https://api.frankfurter.app/latest?from=USD&to=KWD", "rates.KWD"],
      ["https://open.er-api.com/v6/latest/USD", "rates.KWD"],
      ["https://api.exchangerate.host/latest?base=USD&symbols=KWD", "rates.KWD"]
    ];
    for (const [u, p] of fxUrls) {
      try {
        const rate = await tryFX(u, p);
        if (typeof rate === "number" && rate > 0.25 && rate < 0.4) {
          usdToKwd = rate;
          break;
        }
      } catch {}
    }
    if (!usdToKwd) usdToKwd = 0.308; // safe constant

    // 3️⃣  Compute KWD per gram
    const perGram24 = (usdPerOz * usdToKwd) / 31.1034768;
    const round = (n) => Number(n.toFixed(3));
    const prices = {
      k24: round(perGram24),
      k22: round(perGram24 * 22 / 24),
      k21: round(perGram24 * 21 / 24),
      k18: round(perGram24 * 18 / 24)
    };

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      prices,
      updated: new Date().toISOString(),
      source: "metals.live × frankfurter × fallback"
    });
  } catch (e) {
    res.status(500).json({ error: "fetch failed", detail: e.message });
  }
}
