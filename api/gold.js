// /api/gold.js
// Vercel Edge Function with multi-source FX fallback + safe defaults
export const config = { runtime: "edge" };

const OZ_TO_GRAM = 31.1034768;
// A realistic, safe fallback range for USD→KWD
const VALID_MIN = 0.25, VALID_MAX = 0.40;
// Last-known-good USD→KWD if all providers fail (keeps site alive)
const SAFE_USD_KWD = 0.308;

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { "accept": "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function getGoldUsdPerOz() {
  // metals.live → {0:{gold: <price>}, ...}
  const data = await fetchJSON("https://api.metals.live/v1/spot");
  const gold = data?.[0]?.gold;
  if (typeof gold !== "number" || !isFinite(gold)) {
    throw new Error("bad gold price");
  }
  return gold;
}

async function getUsdToKwd() {
  const sources = [
    {
      name: "frankfurter.app",
      fn: async () => {
        const j = await fetchJSON("https://api.frankfurter.app/latest?from=USD&to=KWD");
        return j?.rates?.KWD;
      }
    },
    {
      name: "open.er-api.com",
      fn: async () => {
        const j = await fetchJSON("https://open.er-api.com/v6/latest/USD");
        return j?.rates?.KWD;
      }
    },
    {
      name: "exchangerate.host",
      fn: async () => {
        const j = await fetchJSON("https://api.exchangerate.host/latest?base=USD&symbols=KWD");
        return j?.rates?.KWD;
      }
    }
  ];

  const errors = [];
  for (const s of sources) {
    try {
      const rate = await s.fn();
      if (typeof rate === "number" && isFinite(rate) && rate > VALID_MIN && rate < VALID_MAX) {
        return { rate, source: s.name };
      }
      errors.push(`${s.name}: invalid ${rate}`);
    } catch (e) {
      errors.push(`${s.name}: ${e.message}`);
    }
  }
  // All failed → use safe constant so UI never breaks
  return { rate: SAFE_USD_KWD, source: `fallback (${errors.join(" | ")})` };
}

export default async function handler() {
  try {
    const [goldUsdPerOz, fx] = await Promise.all([getGoldUsdPerOz(), getUsdToKwd()]);
    const kwdPerGram24 = (goldUsdPerOz * fx.rate) / OZ_TO_GRAM;

    const p24 = kwdPerGram24;
    const prices = {
      k24: Number((p24).toFixed(3)),
      k22: Number((p24 * 22 / 24).toFixed(3)),
      k21: Number((p24 * 21 / 24).toFixed(3)),
      k18: Number((p24 * 18 / 24).toFixed(3)),
    };

    return new Response(JSON.stringify({
      prices,
      updated: new Date().toISOString(),
      source: `metals.live × ${fx.source}`
    }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // allow your front-end to cache briefly, but keep it fresh
        "cache-control": "public, max-age=10, s-maxage=10"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "fetch failed",
      detail: err?.message || String(err)
    }), { status: 500, headers: { "content-type": "application/json" } });
  }
}
