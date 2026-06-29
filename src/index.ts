import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer(
  { name: "weather-mcp", version: "0.1.0" },
  { instructions: "Usa get_current_weather para el tiempo actual y get_forecast para el pronóstico de varios días." },
);

// --- Open-Meteo helpers ---

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
}

async function geocodeCity(city: string): Promise<GeoResult> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error geocodificando: ${res.statusText}`);
  const data = (await res.json()) as { results?: GeoResult[] };
  if (!data.results?.length) throw new Error(`Ciudad no encontrada: "${city}"`);
  return data.results[0];
}

const WMO_CODES: Record<number, string> = {
  0: "Despejado",
  1: "Principalmente despejado", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Niebla", 48: "Niebla con escarcha",
  51: "Llovizna ligera", 53: "Llovizna moderada", 55: "Llovizna densa",
  61: "Lluvia ligera", 63: "Lluvia moderada", 65: "Lluvia fuerte",
  71: "Nieve ligera", 73: "Nieve moderada", 75: "Nieve fuerte",
  80: "Chubascos ligeros", 81: "Chubascos moderados", 82: "Chubascos fuertes",
  95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta con granizo fuerte",
};

function describeWeather(code: number): string {
  return WMO_CODES[code] ?? `Código WMO ${code}`;
}

// --- Tool: clima actual ---

server.registerTool(
  "get_current_weather",
  {
    description: "Obtiene el tiempo actual de una ciudad: temperatura, sensación térmica, humedad, viento y descripción del cielo.",
    inputSchema: {
      city: z.string().describe("Nombre de la ciudad, por ejemplo 'Madrid' o 'Buenos Aires'"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ city }) => {
    const geo = await geocodeCity(city);

    const params = new URLSearchParams({
      latitude: String(geo.latitude),
      longitude: String(geo.longitude),
      current: [
        "temperature_2m",
        "apparent_temperature",
        "relative_humidity_2m",
        "wind_speed_10m",
        "wind_direction_10m",
        "weather_code",
        "precipitation",
        "is_day",
      ].join(","),
      timezone: "auto",
      wind_speed_unit: "kmh",
    });

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Error obteniendo datos: ${res.statusText}`);
    const data = (await res.json()) as {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        wind_direction_10m: number;
        weather_code: number;
        precipitation: number;
        is_day: number;
        time: string;
      };
      current_units: Record<string, string>;
    };

    const c = data.current;
    const location = [geo.name, geo.admin1, geo.country].filter(Boolean).join(", ");
    const moment = c.is_day ? "☀️ Día" : "🌙 Noche";

    const text = `
📍 ${location}
🕐 ${c.time} (hora local)  ${moment}

🌡️  Temperatura:      ${c.temperature_2m}°C  (sensación ${c.apparent_temperature}°C)
💧 Humedad:           ${c.relative_humidity_2m}%
🌬️  Viento:           ${c.wind_speed_10m} km/h  (dirección ${c.wind_direction_10m}°)
🌧️  Precipitación:    ${c.precipitation} mm
☁️  Cielo:            ${describeWeather(c.weather_code)}
`.trim();

    return { content: [{ type: "text", text }] };
  },
);

// --- Tool: pronóstico ---

server.registerTool(
  "get_forecast",
  {
    description: "Obtiene el pronóstico del tiempo para los próximos días (hasta 7) de una ciudad.",
    inputSchema: {
      city: z.string().describe("Nombre de la ciudad"),
      days: z.number().int().min(1).max(7).default(5).describe("Número de días del pronóstico (1-7)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ city, days }) => {
    const geo = await geocodeCity(city);

    const params = new URLSearchParams({
      latitude: String(geo.latitude),
      longitude: String(geo.longitude),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
        "wind_speed_10m_max",
        "sunrise",
        "sunset",
      ].join(","),
      timezone: "auto",
      forecast_days: String(days),
      wind_speed_unit: "kmh",
    });

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Error obteniendo pronóstico: ${res.statusText}`);
    const data = (await res.json()) as {
      daily: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
        wind_speed_10m_max: number[];
        sunrise: string[];
        sunset: string[];
      };
    };

    const d = data.daily;
    const location = [geo.name, geo.admin1, geo.country].filter(Boolean).join(", ");

    const rows = d.time.map((date, i) => {
      const sunriseTime = d.sunrise[i].split("T")[1];
      const sunsetTime = d.sunset[i].split("T")[1];
      return [
        `📅 ${date}`,
        `   ${describeWeather(d.weather_code[i])}`,
        `   🌡️  ${d.temperature_2m_min[i]}°C – ${d.temperature_2m_max[i]}°C`,
        `   🌧️  Lluvia: ${d.precipitation_sum[i]} mm   💨 Viento máx: ${d.wind_speed_10m_max[i]} km/h`,
        `   🌅 ${sunriseTime}   🌇 ${sunsetTime}`,
      ].join("\n");
    });

    const text = `📍 Pronóstico para ${location}\n\n${rows.join("\n\n")}`;
    return { content: [{ type: "text", text }] };
  },
);

// --- Tool: UV y calidad del aire ---

server.registerTool(
  "get_uv_and_air",
  {
    description: "Obtiene el índice UV actual y la calidad del aire (PM2.5, PM10, CO) de una ciudad.",
    inputSchema: {
      city: z.string().describe("Nombre de la ciudad"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ city }) => {
    const geo = await geocodeCity(city);

    const [uvRes, airRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=uv_index&timezone=auto`,
      ),
      fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${geo.latitude}&longitude=${geo.longitude}&current=pm2_5,pm10,carbon_monoxide,us_aqi&timezone=auto`,
      ),
    ]);

    if (!uvRes.ok) throw new Error(`Error UV: ${uvRes.statusText}`);
    if (!airRes.ok) throw new Error(`Error calidad del aire: ${airRes.statusText}`);

    const uvData = (await uvRes.json()) as { current: { uv_index: number } };
    const airData = (await airRes.json()) as {
      current: { pm2_5: number; pm10: number; carbon_monoxide: number; us_aqi: number };
    };

    const uv = uvData.current.uv_index;
    const uvLabel =
      uv <= 2 ? "Bajo" : uv <= 5 ? "Moderado" : uv <= 7 ? "Alto" : uv <= 10 ? "Muy alto" : "Extremo";

    const aqi = airData.current.us_aqi;
    const aqiLabel =
      aqi <= 50 ? "Buena" : aqi <= 100 ? "Moderada" : aqi <= 150 ? "Insalubre para grupos sensibles" : "Insalubre";

    const location = [geo.name, geo.admin1, geo.country].filter(Boolean).join(", ");

    const text = `
📍 ${location}

☀️  Índice UV:          ${uv} (${uvLabel})
🌫️  Calidad del aire:   AQI ${aqi} — ${aqiLabel}
    PM2.5:             ${airData.current.pm2_5} µg/m³
    PM10:              ${airData.current.pm10} µg/m³
    CO:                ${airData.current.carbon_monoxide} µg/m³
`.trim();

    return { content: [{ type: "text", text }] };
  },
);

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
