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
// Internationalization
const I18N = {
  en: {
    tagline: "Pick cities and compare the hour of peak wet-bulb temperature, plotted on the NOAA heat index chart.",
    searchPlaceholder: "Search for a city…",
    searchAria: "Search for a city",
    today: "Today",
    tomorrow: "Tomorrow",
    dayAria: "Forecast day",
    chartNote: "Each dot marks a city at its forecast hour of <strong>peak wet-bulb temperature</strong> for the selected day (air temperature vs. relative humidity). Curves and colored zones show the heat index. Off-chart cities are pinned to the chart edge with a hollow marker.",
    thCity: "City", thPeak: "Peak wet-bulb", thAt: "At (local)", thAir: "Air temp",
    thHum: "Humidity", thHi: "Heat index", thRemove: "Remove",
    empty: `No cities yet — search above to add one (up to ${MAX_CITIES}).`,
    footer: 'Weather data by <a href="https://open-meteo.com/" rel="noopener">Open-Meteo.com</a> (CC BY 4.0) · Chart: <a href="https://www.weather.gov/jetstream/hi" rel="noopener">NOAA JetStream heat index graph</a> (public domain) · <a href="https://github.com/Etienne-Lefebvre/wet-bulb-city-compare" rel="noopener">Source on GitHub</a>',
    disclaimer: "Wet-bulb temperatures near 31 °C are dangerous even for healthy people at rest; 35 °C is considered unsurvivable for prolonged exposure. This is a hobby tool — don't use it for safety-critical decisions.",
    noMatches: "No matches",
    loading: (name) => `Loading forecast for ${name}…`,
    loadingMany: "Loading forecasts…",
    loadFail: (name, err) => `Could not load forecast for ${name}: ${err}`,
    loadFailMany: (names) => `Could not load forecasts for: ${names}`,
    already: (name) => `${name} is already on the chart.`,
    limit: `Limit of ${MAX_CITIES} cities reached — remove one first.`,
    searchFail: (err) => `City search failed: ${err}`,
    chartFail: (err) => `Could not load the chart (${err}). If you opened index.html directly from disk, serve it instead: python -m http.server`,
    removeCity: (name) => `Remove ${name}`,
    svgAria: "NOAA heat index chart: air temperature versus relative humidity, with city dots at each city's peak wet-bulb hour",
    tipPeak: (v, time) => `peak wet-bulb ${v}°C at ${time} local`,
    tipAir: (t, f, rh) => `Air ${t}°C (${f}°F), humidity ${rh}%`,
    tipHi: (c, f) => `Heat index ${c}°C (${f}°F)`,
    tipLow: "(cooler than chart range — pinned to bottom edge)",
    tipHigh: "(hotter than chart range — pinned to top edge)",
    cat: { caution: "Caution", excaution: "Extreme caution", danger: "Danger", extreme: "Extreme danger" },
  },
  es: {
    tagline: "Elige ciudades y compara la hora de máxima temperatura de bulbo húmedo, sobre el gráfico de índice de calor de la NOAA.",
    searchPlaceholder: "Busca una ciudad…",
    searchAria: "Buscar una ciudad",
    today: "Hoy",
    tomorrow: "Mañana",
    dayAria: "Día del pronóstico",
    chartNote: "Cada punto marca una ciudad a su hora prevista de <strong>máxima temperatura de bulbo húmedo</strong> del día seleccionado (temperatura del aire vs. humedad relativa). Las curvas y zonas de color muestran el índice de calor. Las ciudades fuera del rango se fijan al borde del gráfico con un marcador hueco.",
    thCity: "Ciudad", thPeak: "Bulbo húmedo máx.", thAt: "Hora (local)", thAir: "Temp. del aire",
    thHum: "Humedad", thHi: "Índice de calor", thRemove: "Quitar",
    empty: `Aún no hay ciudades: busca arriba para añadir una (hasta ${MAX_CITIES}).`,
    footer: 'Datos meteorológicos de <a href="https://open-meteo.com/" rel="noopener">Open-Meteo.com</a> (CC BY 4.0) · Gráfico: <a href="https://www.weather.gov/jetstream/hi" rel="noopener">índice de calor de NOAA JetStream</a> (dominio público) · <a href="https://github.com/Etienne-Lefebvre/wet-bulb-city-compare" rel="noopener">Código en GitHub</a>',
    disclaimer: "Una temperatura de bulbo húmedo cercana a 31 °C es peligrosa incluso para personas sanas en reposo; 35 °C se considera insoportable para el cuerpo en exposición prolongada. Esta es una herramienta casera: no la uses para decisiones de seguridad.",
    noMatches: "Sin resultados",
    loading: (name) => `Cargando el pronóstico de ${name}…`,
    loadingMany: "Cargando pronósticos…",
    loadFail: (name, err) => `No se pudo cargar el pronóstico de ${name}: ${err}`,
    loadFailMany: (names) => `No se pudieron cargar los pronósticos de: ${names}`,
    already: (name) => `${name} ya está en el gráfico.`,
    limit: `Límite de ${MAX_CITIES} ciudades alcanzado: quita una primero.`,
    searchFail: (err) => `Falló la búsqueda de ciudades: ${err}`,
    chartFail: (err) => `No se pudo cargar el gráfico (${err}). Si abriste index.html directamente desde el disco, sírvelo con: python -m http.server`,
    removeCity: (name) => `Quitar ${name}`,
    svgAria: "Gráfico de índice de calor de la NOAA: temperatura del aire frente a humedad relativa, con un punto por ciudad a su hora de máximo bulbo húmedo",
    tipPeak: (v, time) => `bulbo húmedo máx. ${v}°C a las ${time} (hora local)`,
    tipAir: (t, f, rh) => `Aire ${t}°C (${f}°F), humedad ${rh}%`,
    tipHi: (c, f) => `Índice de calor ${c}°C (${f}°F)`,
    tipLow: "(más frío que el rango del gráfico: fijado al borde inferior)",
    tipHigh: "(más caliente que el rango del gráfico: fijado al borde superior)",
    cat: { caution: "Precaución", excaution: "Precaución extrema", danger: "Peligro", extreme: "Peligro extremo" },
  },
  fr: {
    tagline: "Choisis des villes et compare l'heure de la température humide maximale, tracée sur le graphique d'indice de chaleur de la NOAA.",
    searchPlaceholder: "Rechercher une ville…",
    searchAria: "Rechercher une ville",
    today: "Aujourd'hui",
    tomorrow: "Demain",
    dayAria: "Jour de prévision",
    chartNote: "Chaque point marque une ville à son heure prévue de <strong>température humide maximale</strong> (thermomètre mouillé) pour le jour choisi (température de l'air vs humidité relative). Les courbes et zones colorées montrent l'indice de chaleur. Les villes hors du graphique sont fixées au bord avec un marqueur creux.",
    thCity: "Ville", thPeak: "Temp. humide max.", thAt: "Heure (locale)", thAir: "Temp. de l'air",
    thHum: "Humidité", thHi: "Indice de chaleur", thRemove: "Retirer",
    empty: `Aucune ville pour l'instant : cherche ci-dessus pour en ajouter une (jusqu'à ${MAX_CITIES}).`,
    footer: 'Données météo de <a href="https://open-meteo.com/" rel="noopener">Open-Meteo.com</a> (CC BY 4.0) · Graphique : <a href="https://www.weather.gov/jetstream/hi" rel="noopener">indice de chaleur NOAA JetStream</a> (domaine public) · <a href="https://github.com/Etienne-Lefebvre/wet-bulb-city-compare" rel="noopener">Code source sur GitHub</a>',
    disclaimer: "Une température humide proche de 31 °C est dangereuse même pour des personnes en bonne santé au repos ; 35 °C est considérée comme insupportable pour le corps en exposition prolongée. Ceci est un outil amateur : ne l'utilise pas pour des décisions de sécurité.",
    noMatches: "Aucun résultat",
    loading: (name) => `Chargement des prévisions pour ${name}…`,
    loadingMany: "Chargement des prévisions…",
    loadFail: (name, err) => `Impossible de charger les prévisions pour ${name} : ${err}`,
    loadFailMany: (names) => `Impossible de charger les prévisions pour : ${names}`,
    already: (name) => `${name} est déjà sur le graphique.`,
    limit: `Limite de ${MAX_CITIES} villes atteinte : retire d'abord une ville.`,
    searchFail: (err) => `La recherche de villes a échoué : ${err}`,
    chartFail: (err) => `Impossible de charger le graphique (${err}). Si tu as ouvert index.html directement depuis le disque, sers-le plutôt avec : python -m http.server`,
    removeCity: (name) => `Retirer ${name}`,
    svgAria: "Graphique d'indice de chaleur de la NOAA : température de l'air contre humidité relative, avec un point par ville à son heure de température humide maximale",
    tipPeak: (v, time) => `temp. humide max. ${v}°C à ${time} (heure locale)`,
    tipAir: (t, f, rh) => `Air ${t}°C (${f}°F), humidité ${rh}%`,
    tipHi: (c, f) => `Indice de chaleur ${c}°C (${f}°F)`,
    tipLow: "(plus froid que le graphique : fixé au bord inférieur)",
    tipHigh: "(plus chaud que le graphique : fixé au bord supérieur)",
    cat: { caution: "Prudence", excaution: "Prudence extrême", danger: "Danger", extreme: "Danger extrême" },
  },
};

const LANGS = ["en", "es", "fr"];

let lang = localStorage.getItem("wbc-lang") || (() => {
  const nav = (navigator.language || "").toLowerCase().slice(0, 2);
  return LANGS.includes(nav) ? nav : "en";
})();

const t = (key, ...args) => {
  const v = I18N[lang][key];
  return typeof v === "function" ? v(...args) : v;
};

// Translated text for the chart SVG itself. Each entry rewrites one
// <tspan>/<text> (per-glyph x positioning is replaced by a single anchor, so
// translated strings flow naturally in place).
const SVG_ES = [
  // zone words
  { id: "tspan570", text: "EXTREMADAMENTE CALIENTE", x: 163, anchor: "middle", size: 24 },
  { id: "tspan576", text: "MUY CALIENTE", x: 102, anchor: "middle", size: 27 },
  { id: "tspan582", text: "CALIENTE", x: 45, anchor: "middle", size: 20 },
  { id: "tspan588", text: "MUY CÁLIDO", x: 116, anchor: "middle", size: 28 },
  { id: "tspan590", text: "CÁLIDO", x: 116, anchor: "middle", size: 30 },
  // axis titles (the tiny standalone degree glyphs are hidden; ° is inlined)
  { id: "tspan168", text: "Humedad Relativa (%)", x: 171, anchor: "middle" },
  { id: "tspan172", text: "Temperatura del Aire (°C)", x: 167, anchor: "middle" },
  { id: "text174", hide: true },
  { id: "tspan220", text: "Temperatura Aparente (°C)", x: 269, anchor: "middle" },
  { id: "text222", hide: true },
  // big red title (and its outline copy), smaller so it clears the paragraph
  { id: "tspan228", text: "Índice de Calor", x: 0, size: 60 },
  { id: "tspan240", text: "Índice de Calor", x: 0, size: 60 },
  // legend table
  { id: "tspan604", text: "Efectos generales en personas de alto riesgo", x: 197, anchor: "middle" },
  { id: "tspan648", text: "Índice de calor/", x: 93, anchor: "middle" },
  { id: "tspan650", text: "Temperatura aparente", x: 89, anchor: "middle" },
  { id: "tspan706", text: "Golpe de calor o insolación MUY", x: 0, size: 19 },
  { id: "tspan708", text: "PROBABLES con exposición continua", x: 0, size: 19 },
  { id: "tspan710", text: "Insolación, calambres o agotamiento por", x: 0, size: 19 },
  { id: "tspan712", text: "calor PROBABLES; golpe de calor POSIBLE", x: 0, size: 19 },
  { id: "tspan714", text: "con exposición prolongada y actividad física", x: 0, size: 19 },
  { id: "tspan716", text: "Insolación, calambres o agotamiento por", x: 0, size: 19 },
  { id: "tspan718", text: "calor POSIBLES con exposición prolongada", x: 0, size: 19 },
  { id: "tspan720", text: "y/o actividad física", x: 0, size: 19 },
  { id: "tspan722", text: "Fatiga POSIBLE con exposición", x: 0, size: 19 },
  { id: "tspan724", text: "prolongada y/o actividad física", x: 0, size: 19 },
  // description paragraph (top center)
  { id: "tspan246", text: "El “Índice de Calor” mide cuán caluroso se “siente” el clima para el cuerpo. Esta tabla usa la humedad", x: 423.93604 },
  { id: "tspan248", text: "relativa y la temperatura del aire para producir la “temperatura aparente”: la que el cuerpo “siente”.", x: 423.93604 },
  { id: "tspan250", text: "Estos valores son para lugares a la sombra. La exposición al sol pleno puede aumentar el índice de calor", x: 423.93604 },
  { id: "tspan252", text: "hasta en 8°C. Además, los vientos fuertes, sobre todo con aire muy caliente y seco, pueden ser muy peligrosos.", x: 423.93604 },
];

const SVG_FR = [
  // zone words
  { id: "tspan570", text: "EXTRÊMEMENT TORRIDE", x: 163, anchor: "middle", size: 26 },
  { id: "tspan576", text: "TRÈS TORRIDE", x: 102, anchor: "middle", size: 27 },
  { id: "tspan582", text: "TORRIDE", x: 45, anchor: "middle", size: 20 },
  { id: "tspan588", text: "TRÈS CHAUD", x: 116, anchor: "middle", size: 28 },
  { id: "tspan590", text: "CHAUD", x: 116, anchor: "middle", size: 30 },
  // axis titles (the tiny standalone degree glyphs are hidden; ° is inlined)
  { id: "tspan168", text: "Humidité Relative (%)", x: 171, anchor: "middle" },
  { id: "tspan172", text: "Température de l'Air (°C)", x: 167, anchor: "middle" },
  { id: "text174", hide: true },
  { id: "tspan220", text: "Température Apparente (°C)", x: 269, anchor: "middle" },
  { id: "text222", hide: true },
  // big red title (and its outline copy), smaller so it clears the paragraph
  { id: "tspan228", text: "Indice de Chaleur", x: 0, size: 56 },
  { id: "tspan240", text: "Indice de Chaleur", x: 0, size: 56 },
  // legend table
  { id: "tspan604", text: "Effets sur les personnes à haut risque", x: 197, anchor: "middle" },
  { id: "tspan648", text: "Indice de chaleur/", x: 93, anchor: "middle" },
  { id: "tspan650", text: "Température apparente", x: 89, anchor: "middle" },
  { id: "tspan706", text: "Coup de chaleur ou insolation TRÈS", x: 0, size: 19 },
  { id: "tspan708", text: "PROBABLES en cas d'exposition continue", x: 0, size: 19 },
  { id: "tspan710", text: "Insolation, crampes ou épuisement", x: 0, size: 19 },
  { id: "tspan712", text: "PROBABLES, coup de chaleur POSSIBLE si", x: 0, size: 19 },
  { id: "tspan714", text: "exposition prolongée et/ou activité physique", x: 0, size: 19 },
  { id: "tspan716", text: "Insolation, crampes ou épuisement dus à la", x: 0, size: 19 },
  { id: "tspan718", text: "chaleur POSSIBLES si exposition prolongée", x: 0, size: 19 },
  { id: "tspan720", text: "et/ou activité physique", x: 0, size: 19 },
  { id: "tspan722", text: "Fatigue POSSIBLE en cas d'exposition", x: 0, size: 19 },
  { id: "tspan724", text: "prolongée et/ou activité physique", x: 0, size: 19 },
  // description paragraph (top center)
  { id: "tspan246", text: "L'« Indice de Chaleur » mesure la chaleur « ressentie » par le corps. Ce tableau utilise l'humidité relative", x: 423.93604 },
  { id: "tspan248", text: "et la température de l'air pour produire la « température apparente » : celle que le corps « ressent ».", x: 423.93604 },
  { id: "tspan250", text: "Ces valeurs valent pour les endroits à l'ombre. En plein soleil, l'indice de chaleur peut augmenter", x: 423.93604 },
  { id: "tspan252", text: "jusqu'à 8°C. De plus, les vents forts, surtout par air très chaud et sec, peuvent être très dangereux.", x: 423.93604 },
];

const SVG_I18N = { es: SVG_ES, fr: SVG_FR };
const svgOriginals = new Map(); // id -> saved attributes for restoring English

function applySvgEntry(el, entry) {
  if (entry.hide) {
    el.setAttribute("display", "none");
    return;
  }
  el.textContent = entry.text;
  el.setAttribute("x", String(entry.x));
  if (entry.anchor) el.setAttribute("text-anchor", entry.anchor);
  if (entry.size) el.style.fontSize = entry.size + "px";
}

function restoreSvgEntry(el, o) {
  el.textContent = o.text;
  if (o.x == null) el.removeAttribute("x"); else el.setAttribute("x", o.x);
  if (o.anchor == null) el.removeAttribute("text-anchor"); else el.setAttribute("text-anchor", o.anchor);
  el.style.fontSize = o.size;
  if (o.display == null) el.removeAttribute("display"); else el.setAttribute("display", o.display);
}

function translateSvg() {
  const svg = document.querySelector("#chart svg");
  if (!svg) return;
  // Reset everything to the English original first, then apply the current
  // language on top (keeps switching between non-English languages correct).
  for (const [id, o] of svgOriginals) {
    const el = svg.getElementById(id);
    if (el) restoreSvgEntry(el, o);
  }
  const entries = SVG_I18N[lang] || [];
  for (const entry of entries) {
    const el = svg.getElementById(entry.id);
    if (!el) continue;
    if (!svgOriginals.has(entry.id)) {
      svgOriginals.set(entry.id, {
        text: el.textContent,
        x: el.getAttribute("x"),
        anchor: el.getAttribute("text-anchor"),
        size: el.style.fontSize || "",
        display: el.getAttribute("display"),
      });
    }
    applySvgEntry(el, entry);
  }
  svg.setAttribute("aria-label", t("svgAria"));
}

function applyStaticText() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll("[data-i18n-html]")) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }
  const input = document.querySelector("#city-search");
  input.placeholder = t("searchPlaceholder");
  input.setAttribute("aria-label", t("searchAria"));
  document.querySelector(".day-toggle").setAttribute("aria-label", t("dayAria"));
  for (const l of LANGS) {
    const btn = document.querySelector(`#lang-${l}`);
    btn.classList.toggle("active", lang === l);
    btn.setAttribute("aria-pressed", String(lang === l));
  }
}

function setLanguage(next) {
  if (next === lang) return;
  lang = next;
  localStorage.setItem("wbc-lang", lang);
  applyStaticText();
  translateSvg();
  renderAll();
}

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
  if (hiF >= 125) return "extreme";
  if (hiF >= 103) return "danger";
  if (hiF >= 90) return "excaution";
  if (hiF >= 80) return "caution";
  return null;
}

// ---------------------------------------------------------------------------
// State
let cities = []; // {name, admin1, country, countryCode, lat, lon, slot, hourly?, peak?}
let day = "today"; // or "tomorrow"

const $ = (sel) => document.querySelector(sel);

function setStatus(msg) {
  $("#status").textContent = msg || "";
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
    const cat = p.hiCat ? " — " + t("cat")[p.hiCat] : "";
    const tip =
      `${city.name} — ${t("tipPeak", p.wetBulbC.toFixed(1), p.localTime)}` +
      `\n${t("tipAir", p.tempC.toFixed(1), p.tempF.toFixed(0), p.rh)}` +
      `\n${t("tipHi", p.hiC.toFixed(0), p.hiF.toFixed(0))}${cat}` +
      (clampedLow ? "\n" + t("tipLow") : "") +
      (clampedHigh ? "\n" + t("tipHigh") : "");
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
    const cat = p && p.hiCat ? " · " + t("cat")[p.hiCat] : "";
    tr.innerHTML = `
      <td><span class="swatch slot-${city.slot}" aria-hidden="true"></span>${escapeHtml(place)}</td>
      <td class="num">${p ? `<strong>${p.wetBulbC.toFixed(1)} °C</strong>` : "—"}</td>
      <td class="num">${p ? p.localTime : "—"}</td>
      <td class="num">${p ? `${p.tempC.toFixed(1)} °C / ${p.tempF.toFixed(0)} °F` : "—"}</td>
      <td class="num">${p ? p.rh + " %" : "—"}</td>
      <td class="num">${p ? `${p.hiC.toFixed(0)} °C${escapeHtml(cat)}` : "—"}</td>
      <td></td>`;
    const btn = document.createElement("button");
    btn.className = "remove-btn";
    btn.textContent = "×";
    btn.setAttribute("aria-label", t("removeCity", city.name));
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
    setStatus(t("already", place.name));
    return;
  }
  const slot = freeSlot();
  if (slot === -1) {
    setStatus(t("limit"));
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
  setStatus(t("loading", city.name));
  try {
    await fetchForecast(city);
    setStatus("");
  } catch (err) {
    cities = cities.filter((c) => c !== city);
    setStatus(t("loadFail", city.name, err.message));
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
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=${lang}&format=json`);
      if (!res.ok) throw new Error(`geocoding failed (${res.status})`);
      const json = await res.json();
      results = json.results || [];
      list.innerHTML = "";
      if (results.length === 0) {
        const li = document.createElement("li");
        li.className = "no-results";
        li.textContent = t("noMatches");
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
      setStatus(t("searchFail", err.message));
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
// Toggles
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

function setupLangToggle() {
  for (const l of LANGS) {
    $(`#lang-${l}`).addEventListener("click", () => setLanguage(l));
  }
}

// ---------------------------------------------------------------------------
// Init
async function init() {
  setupSearch();
  setupDayToggle();
  setupLangToggle();
  applyStaticText();

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
    $("#chart").replaceChildren(svg);
    translateSvg();
  } catch (err) {
    setStatus(t("chartFail", err.message));
    return;
  }

  // Restore saved cities.
  const saved = loadSavedCities();
  if (saved.length > 0) {
    setStatus(t("loadingMany"));
    cities = saved.slice(0, MAX_CITIES);
    const outcomes = await Promise.allSettled(cities.map(fetchForecast));
    const failed = cities.filter((_, i) => outcomes[i].status === "rejected");
    if (failed.length > 0) {
      setStatus(t("loadFailMany", failed.map((c) => c.name).join(", ")));
      cities = cities.filter((_, i) => outcomes[i].status === "fulfilled");
    } else {
      setStatus("");
    }
  }
  renderAll();
}

init();
