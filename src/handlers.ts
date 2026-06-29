import { geocodeCity, describeWeather } from "./weather.js";

export async function getCurrentWeather(city: string): Promise<string> {
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
  };

  const c = data.current;
  const location = [geo.name, geo.admin1, geo.country].filter(Boolean).join(", ");
  const moment = c.is_day ? "☀️ Día" : "🌙 Noche";

  return `
📍 ${location}
🕐 ${c.time} (hora local)  ${moment}

🌡️  Temperatura:      ${c.temperature_2m}°C  (sensación ${c.apparent_temperature}°C)
💧 Humedad:           ${c.relative_humidity_2m}%
🌬️  Viento:           ${c.wind_speed_10m} km/h  (dirección ${c.wind_direction_10m}°)
🌧️  Precipitación:    ${c.precipitation} mm
☁️  Cielo:            ${describeWeather(c.weather_code)}
`.trim();
}

export async function getForecast(city: string, days: number): Promise<string> {
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

  return `📍 Pronóstico para ${location}\n\n${rows.join("\n\n")}`;
}

export async function getUvAndAir(city: string): Promise<string> {
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
    aqi <= 50
      ? "Buena"
      : aqi <= 100
        ? "Moderada"
        : aqi <= 150
          ? "Insalubre para grupos sensibles"
          : "Insalubre";

  const location = [geo.name, geo.admin1, geo.country].filter(Boolean).join(", ");

  return `
📍 ${location}

☀️  Índice UV:          ${uv} (${uvLabel})
🌫️  Calidad del aire:   AQI ${aqi} — ${aqiLabel}
    PM2.5:             ${airData.current.pm2_5} µg/m³
    PM10:              ${airData.current.pm10} µg/m³
    CO:                ${airData.current.carbon_monoxide} µg/m³
`.trim();
}
