// Météo du jour (Open-Meteo, gratuit, sans clé) — utilisée sur l'accueil si la localisation est autorisée
import { permState, getPosition } from './permissions.js';

const KEY = 'mon-quotidien-weather';
const CODES = [[0, '☀️', 'Ensoleillé'], [2, '⛅', 'Éclaircies'], [3, '☁️', 'Couvert'], [48, '🌫', 'Brouillard'], [57, '🌦', 'Bruine'], [67, '🌧', 'Pluie'], [77, '🌨', 'Neige'], [82, '🌧', 'Averses'], [86, '🌨', 'Averses de neige'], [99, '⛈', 'Orage']];
const describe = (c) => (CODES.find(([max]) => c <= max) || CODES.at(-1)).slice(1);

export async function getWeather() {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY));
    if (cached && Date.now() - cached.t < 30 * 60e3) return cached;
  } catch {}
  if ((await permState('geolocation')) !== 'granted') return null;
  try {
    const p = await getPosition({ enableHighAccuracy: false, maximumAge: 30 * 60e3 });
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(3)}&longitude=${p.lng.toFixed(3)}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
    const d = await (await fetch(url)).json();
    const [icon, label] = describe(d.current.weather_code);
    const w = { t: Date.now(), temp: Math.round(d.current.temperature_2m), icon, label, max: Math.round(d.daily.temperature_2m_max[0]), min: Math.round(d.daily.temperature_2m_min[0]), rain: d.daily.precipitation_probability_max?.[0] };
    localStorage.setItem(KEY, JSON.stringify(w));
    return w;
  } catch { return null; }
}
