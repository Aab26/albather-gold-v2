// /api/gold.js  (Node serverless on Vercel — CommonJS)

const G_PER_TROY_OUNCE = 31.1034768;

const KARATS = {
  k24: 24 / 24,
  k22: 22 / 24,
  k21: 21 / 24,
  k18: 18 / 24,
};

// Small utility: fetch with timeout + retries
async function fetchJSON(url, { timeoutMs = 6000, retries = 2, headers = {} } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "albather-gold/1.0 (+vercel)",
          "accept": "application/json, */*",
          ...headers,
        },
        redirect: "follow",
        signal: controller.signal,
      });

      clearTimeout(id);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        // some endpoints (metals.live) return arrays or numbers; try to eval safely
        return JSON.parse(text); // will throw again if truly not JSON
      }
    } catch (err) {
      clearTimeout(id);
      if (attempt === retries) throw err;
      // brief backoff
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
}

// Parse spot gold (USD/oz) from different providers
async function getGoldUsdPerOunce() {
  // 1) metals.live (no key)
  try {
    // returns an array like: [ [timestamp, price], ... ] or [price1, price2, ...]
    const data = await fetchJSON("https://api.metals.live/v1/spot/gold");
    let price;

    if (Array.isArray(data)) {
      const last = data[data.length - 1];
      if (Array.isArray(last)) price = Number(last[1]);
      else price = Number(last);
    }
    if (!isFinite(price)) throw new Error("bad metals.live format");
    return { usdPerOunce: price, source: "metals.live" };
  } catch (_) { /* fall through */ }

  // 2) metals.dev (needs key, optional)
  try {
    const key = process.env.METALS_DEV_KEY; // optional
    if (key) {
      const d = await fetchJSON(
        `https://api.metals.dev/v1/latest?api_key=${encodeURIComponent(key)}&symbols=XAU&currencies=USD`
      );
      // expecting d.metals.XAU.price
      const price = Number(d?.metals?.XAU?.price);
      if (!isFinite(price)) throw new Error("bad metals.dev format");
      return { usdPerOunce: price, source: "metals.dev" };
    }
  } catch (_) { /* fall through */ }

  throw new Error("no spot source available");
}

async function getUsdToKwd() {
  const fx = await fetchJSON("https://api.exchangerate.host/latest?base=USD&symbols=KWD");
  const rate = Number(fx?.rates?.KWD);
  if (!isFinite(rate) || rate <= 0) throw new Error("bad USD→KWD rate");
  return rate;
}

function toFixed3(n) {
  return Number(n).toFixed(3);
}

module.exports = async (req, res) => {
  try {
    const [{ usdPerOunce, source }, usdToKwd] = await Promise.all([
      getGoldUsdPerOunce(),
      getUsdToKwd(),
    ]);

    const usdPerGram = usdPerOunce / G_PER_TROY_OUNCE;
    const kwdPerGram24 = usdPerGram * usdToKwd;

    const prices = {
      k24: Number(toFixed3(kwdPerGram24 * KARATS.k24)),
      k22: Number(toFixed3(kwdPerGram24 * KARATS.k22)),
      k21: Number(toFixed3(kwdPerGram24 * KARATS.k21)),
      k18: Number(toFixed3(kwdPerGram24 * KARATS.k18)),
    };

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.status(200).send(JSON.stringify({
      prices,
      source: `${source} × exchangerate.host`,
      updated: new Date().toISOString(),
    }));
  } catch (err) {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(500).send(JSON.stringify({ error: "fetch failed", detail: String(err && err.message || err) }));
  }
};
