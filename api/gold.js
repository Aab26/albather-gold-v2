export default async function handler(req, res) {
  try {
    const metals = await fetch('https://metals.dev/api/latest?base=XAU');
    const data = await metals.json();
    const rateUSD = data.rates.USD;
    const fx = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=KWD');
    const fxdata = await fx.json();
    const usdToKwd = fxdata.rates.KWD;
    const pricePerGram = (rateUSD / 31.1035) * usdToKwd;
    const prices = {
      k24: pricePerGram,
      k22: pricePerGram * 0.9167,
      k21: pricePerGram * 0.875,
      k18: pricePerGram * 0.75,
    };
    res.status(200).json({ prices, source: 'metals.dev + exchangerate.host', updated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'fetch failed' });
  }
}
