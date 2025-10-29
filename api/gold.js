async function fetchPrices() {
  try {
    const res = await fetch('/api/gold');
    const data = await res.json();
    if (data.prices) {
      document.getElementById("k24").innerText = data.prices.k24.toFixed(3);
      document.getElementById("k22").innerText = data.prices.k22.toFixed(3);
      document.getElementById("k21").innerText = data.prices.k21.toFixed(3);
      document.getElementById("k18").innerText = data.prices.k18.toFixed(3);
    }
  } catch (err) {
    console.error("Error fetching prices:", err);
  }
}
