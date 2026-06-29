import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentWeather, getForecast, getUvAndAir } from "../handlers.js";

// --- Fixtures ---

const GEO_MADRID = {
  name: "Madrid",
  latitude: 40.4165,
  longitude: -3.70256,
  country: "España",
  admin1: "Comunidad de Madrid",
};

const GEO_BOGOTA = {
  name: "Bogotá",
  latitude: 4.71099,
  longitude: -74.07209,
  country: "Colombia",
};

const CURRENT_WEATHER_RESPONSE = {
  current: {
    temperature_2m: 22,
    apparent_temperature: 20,
    relative_humidity_2m: 55,
    wind_speed_10m: 15,
    wind_direction_10m: 270,
    weather_code: 1,
    precipitation: 0,
    is_day: 1,
    time: "2026-06-29T14:00",
  },
};

const FORECAST_RESPONSE = {
  daily: {
    time: ["2026-06-29", "2026-06-30"],
    weather_code: [0, 61],
    temperature_2m_max: [28, 20],
    temperature_2m_min: [15, 12],
    precipitation_sum: [0, 5.2],
    wind_speed_10m_max: [20, 35],
    sunrise: ["2026-06-29T06:45", "2026-06-30T06:46"],
    sunset: ["2026-06-29T21:30", "2026-06-30T21:29"],
  },
};

const UV_RESPONSE = { current: { uv_index: 6 } };
const AIR_RESPONSE = {
  current: { pm2_5: 12.5, pm10: 20.1, carbon_monoxide: 230.0, us_aqi: 45 },
};

// Keys deben ser substrings únicos de cada URL — el orden importa: más específicos primero.
// "air-quality-api.open-meteo.com" contiene "/v1/forecast" como substring,
// por eso se usa "/v1/air-quality" y "/v1/forecast" para diferenciarlos.
function makeFetch(responses: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    for (const [key, body] of Object.entries(responses)) {
      if (url.includes(key)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
      }
    }
    return Promise.resolve({ ok: false, statusText: "Not Found", json: () => Promise.resolve({}) });
  });
}

function geoFetch(geo: object) {
  return { ok: true, json: () => Promise.resolve({ results: [geo] }) };
}

// --- getCurrentWeather ---

describe("getCurrentWeather", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("devuelve texto con datos del clima actual (de día)", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": CURRENT_WEATHER_RESPONSE,
      }),
    );

    const result = await getCurrentWeather("Madrid");

    expect(result).toContain("Madrid");
    expect(result).toContain("Comunidad de Madrid");
    expect(result).toContain("España");
    expect(result).toContain("22°C");
    expect(result).toContain("sensación 20°C");
    expect(result).toContain("55%");
    expect(result).toContain("15 km/h");
    expect(result).toContain("270°");
    expect(result).toContain("☀️ Día");
    expect(result).toContain("Principalmente despejado");
  });

  it("muestra 🌙 Noche cuando is_day es 0", async () => {
    const nightResponse = {
      current: { ...CURRENT_WEATHER_RESPONSE.current, is_day: 0 },
    };
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": nightResponse,
      }),
    );

    const result = await getCurrentWeather("Madrid");

    expect(result).toContain("🌙 Noche");
  });

  it("formatea ubicación sin admin1 cuando no está disponible", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_BOGOTA] },
        "/v1/forecast": CURRENT_WEATHER_RESPONSE,
      }),
    );

    const result = await getCurrentWeather("Bogotá");

    expect(result).toContain("Bogotá, Colombia");
    expect(result).not.toContain("undefined");
  });

  it("propaga error cuando la geocodificación falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, statusText: "Bad Gateway" }));

    await expect(getCurrentWeather("???")).rejects.toThrow("Error geocodificando: Bad Gateway");
  });

  it("lanza error cuando la API de forecast no responde OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(geoFetch(GEO_MADRID))
        .mockResolvedValueOnce({ ok: false, statusText: "Internal Server Error" }),
    );

    await expect(getCurrentWeather("Madrid")).rejects.toThrow(
      "Error obteniendo datos: Internal Server Error",
    );
  });

  it("incluye precipitación en la salida", async () => {
    const rainyResponse = {
      current: { ...CURRENT_WEATHER_RESPONSE.current, precipitation: 3.5, weather_code: 61 },
    };
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": rainyResponse,
      }),
    );

    const result = await getCurrentWeather("Madrid");

    expect(result).toContain("3.5 mm");
    expect(result).toContain("Lluvia ligera");
  });
});

// --- getForecast ---

describe("getForecast", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("devuelve pronóstico con los días solicitados", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": FORECAST_RESPONSE,
      }),
    );

    const result = await getForecast("Madrid", 2);

    expect(result).toContain("Pronóstico para Madrid");
    expect(result).toContain("2026-06-29");
    expect(result).toContain("2026-06-30");
  });

  it("extrae correctamente las horas de amanecer y atardecer", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": FORECAST_RESPONSE,
      }),
    );

    const result = await getForecast("Madrid", 2);

    expect(result).toContain("06:45");
    expect(result).toContain("21:30");
    expect(result).toContain("06:46");
    expect(result).toContain("21:29");
  });

  it("muestra temperatura máx y mín de cada día", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": FORECAST_RESPONSE,
      }),
    );

    const result = await getForecast("Madrid", 2);

    expect(result).toContain("15°C – 28°C");
    expect(result).toContain("12°C – 20°C");
  });

  it("muestra precipitación y viento de cada día", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": FORECAST_RESPONSE,
      }),
    );

    const result = await getForecast("Madrid", 2);

    expect(result).toContain("0 mm");
    expect(result).toContain("5.2 mm");
    expect(result).toContain("20 km/h");
    expect(result).toContain("35 km/h");
  });

  it("lanza error cuando la API de forecast no responde OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(geoFetch(GEO_MADRID))
        .mockResolvedValueOnce({ ok: false, statusText: "Too Many Requests" }),
    );

    await expect(getForecast("Madrid", 3)).rejects.toThrow(
      "Error obteniendo pronóstico: Too Many Requests",
    );
  });

  it("incluye descripción del cielo por código WMO", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": FORECAST_RESPONSE,
      }),
    );

    const result = await getForecast("Madrid", 2);

    expect(result).toContain("Despejado");
    expect(result).toContain("Lluvia ligera");
  });
});

// --- getUvAndAir ---

describe("getUvAndAir", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("devuelve índice UV y calidad del aire correctamente", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": UV_RESPONSE,
        "/v1/air-quality": AIR_RESPONSE,
      }),
    );

    const result = await getUvAndAir("Madrid");

    expect(result).toContain("Madrid");
    expect(result).toContain("6 (Alto)");
    expect(result).toContain("AQI 45");
    expect(result).toContain("Buena");
    expect(result).toContain("12.5 µg/m³");
    expect(result).toContain("20.1 µg/m³");
    expect(result).toContain("230");
  });

  it.each([
    [1, "Bajo"],
    [2, "Bajo"],
    [3, "Moderado"],
    [5, "Moderado"],
    [6, "Alto"],
    [7, "Alto"],
    [8, "Muy alto"],
    [10, "Muy alto"],
    [11, "Extremo"],
  ])("clasifica UV %i como '%s'", async (uv, label) => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": { current: { uv_index: uv } },
        "/v1/air-quality": AIR_RESPONSE,
      }),
    );

    const result = await getUvAndAir("Madrid");

    expect(result).toContain(label);
  });

  it.each([
    [25, "Buena"],
    [50, "Buena"],
    [75, "Moderada"],
    [100, "Moderada"],
    [125, "Insalubre para grupos sensibles"],
    [150, "Insalubre para grupos sensibles"],
    [200, "Insalubre"],
  ])("clasifica AQI %i como '%s'", async (aqi, label) => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "geocoding-api.open-meteo": { results: [GEO_MADRID] },
        "/v1/forecast": UV_RESPONSE,
        "/v1/air-quality": {
          current: { ...AIR_RESPONSE.current, us_aqi: aqi },
        },
      }),
    );

    const result = await getUvAndAir("Madrid");

    expect(result).toContain(label);
  });

  it("lanza error cuando la API de UV no responde OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(geoFetch(GEO_MADRID))
        .mockResolvedValueOnce({ ok: false, statusText: "Gateway Timeout" })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(AIR_RESPONSE) }),
    );

    await expect(getUvAndAir("Madrid")).rejects.toThrow("Error UV: Gateway Timeout");
  });

  it("lanza error cuando la API de calidad del aire no responde OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(geoFetch(GEO_MADRID))
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(UV_RESPONSE) })
        .mockResolvedValueOnce({ ok: false, statusText: "Service Unavailable" }),
    );

    await expect(getUvAndAir("Madrid")).rejects.toThrow(
      "Error calidad del aire: Service Unavailable",
    );
  });
});
