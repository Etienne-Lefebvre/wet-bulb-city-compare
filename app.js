/* Wet-Bulb City Compare
 * Plots each city's forecast hour of peak wet-bulb temperature on the
 * NOAA heat index chart (air temperature vs. relative humidity).
 * Data: Open-Meteo (no API key). Chart: NOAA JetStream (public domain).
 */
"use strict";

// ---------------------------------------------------------------------------
// Chart calibration (SVG root coordinates, viewBox 0 0 1800 1440).
// Derived from the chart's own gridlines:
//   humidity gridlines: 0% at x=160.09, 15.8063 px per %RH
//   temperature gridlines: 130 degF at y=439.56, 13.9091 px per degF, up = hotter
const CHART = {
  xAtRh0: 160.09,
  pxPerRh: 15.8063,
  yAtF130: 439.56,
  pxPerF: 13.9091,
  tMinF: 70,
  tMaxF: 140,
};
const xForRh = (rh) => CHART.xAtRh0 + CHART.pxPerRh * rh;
const yForTempF = (tF) => CHART.yAtF130 + (130 - tF) * CHART.pxPerF;

// Categorical palette (validated, fixed slot order — never cycled).
const PALETTE = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"];
const MAX_CITIES = PALETTE.length;

// ---------------------------------------------------------------------------
// Meteorology helpers
const cToF = (c) => c * 1.8 + 32;
const fToC = (f) => (f - 32) / 1.8;

// Stull (2011) wet-bulb approximation — fallback if the API omits the field.
function wetBulbStull(tC, rh) {
  return (
    tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  );
}

// NWS heat index (Rothfusz regression with official adjustments), in degF.
function heatIndexF(tF, rh) {
  const simple = 0.5 * (tF + 61.0 + (tF - 68.0) * 1.2 + rh * 0.094);
  if ((simple + tF) / 2 < 80) return simple;
  let hi =
    -42.379 + 2.04901523 * tF + 10.14333127 * rh -
    0.22475541 * tF * rh - 0.00683783 * tF * tF -
    0.05481717 * rh * rh + 0.00122874 * tF * tF * rh +
    0.00085282 * tF * rh * rh - 0.00000199 * tF * tF * rh * rh;
  if (rh < 13 && tF >= 80 && tF <= 112) {
    hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tF - 95)) / 17);
  } else if (rh > 85 && tF >= 80 && tF <= 87) {
    hi += ((rh - 85) / 10) * ((87 - tF) / 5);
  }
  return hi;
}

function heatIndexCategory(hiF) {
  if (hiF >= 125) return "Extreme danger";
  if (hiF >= 103) return "Danger";
  if (hiF >= 90) return "Extreme caution";
  if (hiF >= 80) return "Caution";
  return "—";
}

// ---------------------------------------------------------------------------
// State
let cities = []; // {name, admin1, country, countryCode, lat, lon, slot, hourly?, peak?}
let day = "today"; // or "tomorrow"

const $ = (sel) => document.querySelector(sel);
const statusEl = () => $("#status");

function setStatus(msg) {
  statusEl().textContent = msg || "";
}

function saveCities() {
  const slim = cities.map(({ name, admin1, country, countryCode, lat, lon, slot }) =>
    ({ name, admin1, country, countryCode, lat, lon, slot }));
  localStorage.setItem("wbc-cities", JSON.stringify(slim));
}

function loadSavedCities() {
  try {
    return JSON.parse(localStorage.getItem("wbc-cities")) || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Data fetching
async function fetchForecast(city) {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${city.lat}&longitude=${city.lon}` +
    "&hourly=temperature_2m,relative_humidity_2m,wet_bulb_temperature_2m" +
    "&forecast_days=2&timezone=auto";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Forecast request failed (${res.status})`);
  const json = await res.json();
  const h = json.hourly;
  if (!h || !h.time) throw new Error("Forecast response missing hourly data");
  city.hourly = {
    time: h.time,
    tempC: h.temperature_2m,
    rh: h.relative_humidity_2m,
    wetBulbC: h.wet_bulb_temperature_2m ||
      h.temperature_2m.map((t, i) => (t == null ? null : wetBulbStull(t, h.relative_humidity_2m[i]))),
  };
}

// Pick the hour of peak wet-bulb within the selected day (hours 0-23 or 24-47).
function computePeak(city) {
  const { time, tempC, rh, wetBulbC } = city.hourly;
  const start = day === "today" ? 0 : 24;
  const end = Math.min(start + 24, time.length);
  let best = -1;
  for (let i = start; i < end; i++) {
    if (wetBulbC[i] == null || tempC[i] == null || rh[i] == null) continue;
    if (best === -1 || wetBulbC[i] > wetBulbC[best]) best = i;
  }
  if (best === -1) {
    city.peak = null;
    return;
  }
  const tF = cToF(tempC[best]);
  const hiF = heatIndexF(tF, rh[best]);
  city.peak = {
    wetBulbC: wetBulbC[best],
    tempC: tempC[best],
    tempF: tF,
    rh: rh[best],
    hiF,
    hiC: fToC(hiF),
    hiCat: heatIndexCategory(hiF),
    localTime: time[best].slice(11), // "HH:MM"
  };
}

// ---------------------------------------------------------------------------
// Rendering — dots on the SVG
const SVG_NS = "http://www.w3.org/2000/svg";

function el(name, attrs, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

function renderDots() {
  const svg = $("#chart svg");
  if (!svg) return;
  let layer = svg.querySelector("#city-dots");
  if (layer) layer.remove();
  layer = el("g", { id: "city-dots" });
  svg.appendChild(layer);

  const placedLabels = []; // for simple collision nudging

  for (const city of cities) {
    if (!city.peak) continue;
    const p = city.peak;
    const color = PALETTE[city.slot];

    // Clamp off-chart temperatures to the chart edge; mark with a hollow dot.
    const clampedLow = p.tempF < CHART.tMinF;
    const clampedHigh = p.tempF > CHART.tMaxF;
    const tPlot = Math.min(Math.max(p.tempF, CHART.tMinF), CHART.tMaxF);
    const cx = xForRh(p.rh);
    const cy = yForTempF(tPlot);

    const g = el("g", { class: "city-dot", "data-name": city.name });
    const tip =
      `${city.name} — peak wet-bulb ${p.wetBulbC.toFixed(1)}°C at ${p.localTime} local` +
      `\nAir ${p.tempC.toFixed(1)}°C (${p.tempF.toFixed(0)}°F), humidity ${p.rh}%` +
      `\nHeat index ${p.hiC.toFixed(0)}°C (${p.hiF.toFixed(0)}°F) ${p.hiCat !== "—" ? "— " + p.hiCat : ""}` +
      (clampedLow ? "\n(cooler than chart range — pinned to bottom edge)" : "") +
      (clampedHigh ? "\n(hotter than chart range — pinned to top edge)" : "");
    g.appendChild(el("title", {}, tip));

    g.appendChild(el("circle", {
      cx, cy, r: 16,
      fill: clampedLow || clampedHigh ? "#ffffff" : color,
      stroke: clampedLow || clampedHigh ? color : "#ffffff",
      "stroke-width": clampedLow || clampedHigh ? 6 : 4,
    }));

    // Direct label, black ink with a white halo; flip side near the right edge.
    const labelRight = cx < 1450;
    let lx = labelRight ? cx + 26 : cx - 26;
    let ly = cy + 10;
    const approxW = city.name.length * 16;
    const x0 = labelRight ? lx : lx - approxW;
    for (const b of placedLabels) {
      const overlapX = x0 < b.x1 && x0 + approxW > b.x0;
      if (overlapX && Math.abs(ly - b.y) < 36) ly = b.y + 36;
    }
    ly = Math.min(Math.max(ly, 320), 1268);
    placedLabels.push({ x0, x1: x0 + approxW, y: ly });

    g.appendChild(el("text", {
      x: lx, y: ly,
      class: "dot-label",
      "text-anchor": labelRight ? "start" : "end",
    }, city.name));

    layer.appendChild(g);
  }
}

// ---------------------------------------------------------------------------
// Rendering — city table
function renderTable() {
  const table = $("#city-table");
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";
  table.hidden = cities.length === 0;
  $("#empty-hint").hidden = cities.length !== 0;

  for (const city of cities) {
    const tr = document.createElement("tr");
    const p = city.peak;
    const place = [city.name, city.admin1, city.country].filter(Boolean).join(", ");
    tr.innerHTML = `
      <td><span class="swatch slot-${city.slot}" aria-hidden="true"></span>${escapeHtml(place)}</td>
      <td class="num">${p ? `<strong>${p.wetBulbC.toFixed(1)} °C</strong>` : "—"}</td>
      <td class="num">${p ? p.localTime : "—"}</td>
      <td class="num">${p ? `${p.tempC.toFixed(1)} °C / ${p.tempF.toFixed(0)} °F` : "—"}</td>
      <td class="num">${p ? p.rh + " %" : "—"}</td>
      <td class="num">${p ? `${p.hiC.toFixed(0)} °C${p.hiCat !== "—" ? " · " + p.hiCat : ""}` : "—"}</td>
      <td></td>`;
    const btn = document.createElement("button");
    btn.className = "remove-btn";
    btn.textContent = "×";
    btn.setAttribute("aria-label", `Remove ${city.name}`);
    btn.addEventListener("click", () => removeCity(city));
    tr.lastElementChild.appendChild(btn);
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderAll() {
  for (const city of cities) if (city.hourly) computePeak(city);
  renderDots();
  renderTable();
}

// ---------------------------------------------------------------------------
// City management
function freeSlot() {
  const used = new Set(cities.map((c) => c.slot));
  for (let i = 0; i < MAX_CITIES; i++) if (!used.has(i)) return i;
  return -1;
}

async function addCity(place) {
  if (cities.some((c) => c.lat === place.latitude && c.lon === place.longitude)) {
    setStatus(`${place.name} is already on the chart.`);
    return;
  }
  const slot = freeSlot();
  if (slot === -1) {
    setStatus(`Limit of ${MAX_CITIES} cities reached — remove one first.`);
    return;
  }
  const city = {
    name: place.name,
    admin1: place.admin1 || "",
    country: place.country || "",
    countryCode: place.country_code || "",
    lat: place.latitude,
    lon: place.longitude,
    slot,
  };
  cities.push(city);
  setStatus(`Loading forecast for ${city.name}…`);
  try {
    await fetchForecast(city);
    setStatus("");
  } catch (err) {
    cities = cities.filter((c) => c !== city);
    setStatus(`Could not load forecast for ${city.name}: ${err.message}`);
  }
  saveCities();
  renderAll();
}

function removeCity(city) {
  cities = cities.filter((c) => c !== city);
  saveCities();
  renderAll();
}

// ---------------------------------------------------------------------------
// Search
function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function setupSearch() {
  const input = $("#city-search");
  const list = $("#search-results");
  let timer = null;
  let results = [];

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    list.innerHTML = "";
    results = [];
  }

  async function runSearch(q) {
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`);
      if (!res.ok) throw new Error(`geocoding failed (${res.status})`);
      const json = await res.json();
      results = json.results || [];
      list.innerHTML = "";
      if (results.length === 0) {
        const li = document.createElement("li");
        li.className = "no-results";
        li.textContent = "No matches";
        list.appendChild(li);
      }
      results.forEach((r) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        const detail = [r.admin1, r.country].filter(Boolean).join(", ");
        li.innerHTML = `<strong>${escapeHtml(r.name)}</strong> <span class="detail">${escapeHtml(detail)}</span> ${flagEmoji(r.country_code)}`;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault(); // fire before input blur
          input.value = "";
          close();
          addCity(r);
        });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    } catch (err) {
      setStatus(`City search failed: ${err.message}`);
      close();
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      close();
      return;
    }
    timer = setTimeout(() => runSearch(q), 300);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      input.value = "";
      const first = results[0];
      close();
      addCity(first);
    } else if (e.key === "Escape") {
      close();
    }
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}

// ---------------------------------------------------------------------------
// Day toggle
function setupDayToggle() {
  const btns = { today: $("#day-today"), tomorrow: $("#day-tomorrow") };
  for (const [key, btn] of Object.entries(btns)) {
    btn.addEventListener("click", () => {
      day = key;
      for (const [k, b] of Object.entries(btns)) {
        b.classList.toggle("active", k === key);
        b.setAttribute("aria-pressed", String(k === key));
      }
      renderAll();
    });
  }
}

// ---------------------------------------------------------------------------
// Init
async function init() {
  setupSearch();
  setupDayToggle();

  // Inject the chart SVG inline so we can draw on it.
  try {
    const res = await fetch("graph.svg");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const div = document.createElement("div");
    div.innerHTML = await res.text();
    const svg = div.querySelector("svg");
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "NOAA heat index chart: air temperature versus relative humidity, with city dots at each city's peak wet-bulb hour");
    $("#chart").replaceChildren(svg);
  } catch (err) {
    setStatus(`Could not load the chart (${err.message}). If you opened index.html directly from disk, serve it instead: python -m http.server`);
    return;
  }

  // Restore saved cities.
  const saved = loadSavedCities();
  if (saved.length > 0) {
    setStatus("Loading forecasts…");
    cities = saved.slice(0, MAX_CITIES);
    const outcomes = await Promise.allSettled(cities.map(fetchForecast));
    const failed = cities.filter((_, i) => outcomes[i].status === "rejected");
    if (failed.length > 0) {
      setStatus(`Could not load forecasts for: ${failed.map((c) => c.name).join(", ")}`);
      cities = cities.filter((_, i) => outcomes[i].status === "fulfilled");
    } else {
      setStatus("");
    }
  }
  renderAll();
}

init();
