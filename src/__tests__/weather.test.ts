import { describe, it, expect, vi, beforeEach } from "vitest";
import { geocodeCity, describeWeather, WMO_CODES } from "../weather.js";

function mockFetch(body: unknown, ok = true, statusText = "OK") {
  return vi.fn().mockResolvedValue({
    ok,
    statusText,
    json: () => Promise.resolve(body),
  });
}

describe("describeWeather", () => {
  it("devuelve descripción para todos los códigos WMO conocidos", () => {
    for (const [code, label] of Object.entries(WMO_CODES)) {
      expect(describeWeather(Number(code))).toBe(label);
    }
  });

  it("devuelve fallback para código desconocido", () => {
    expect(describeWeather(999)).toBe("Código WMO 999");
    expect(describeWeather(0)).toBe("Despejado");
  });

  it("cubre todos los rangos de condiciones meteorológicas", () => {
    expect(describeWeather(0)).toBe("Despejado");
    expect(describeWeather(3)).toBe("Nublado");
    expect(describeWeather(45)).toBe("Niebla");
    expect(describeWeather(55)).toBe("Llovizna densa");
    expect(describeWeather(65)).toBe("Lluvia fuerte");
    expect(describeWeather(75)).toBe("Nieve fuerte");
    expect(describeWeather(82)).toBe("Chubascos fuertes");
    expect(describeWeather(99)).toBe("Tormenta con granizo fuerte");
  });
});

describe("geocodeCity", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve el primer resultado cuando la API responde correctamente", async () => {
    const geoResult = {
      name: "Madrid",
      latitude: 40.4165,
      longitude: -3.70256,
      country: "España",
      admin1: "Comunidad de Madrid",
    };
    vi.stubGlobal("fetch", mockFetch({ results: [geoResult] }));

    const result = await geocodeCity("Madrid");

    expect(result).toEqual(geoResult);
  });

  it("construye la URL con el nombre de ciudad codificado", async () => {
    const fetchMock = mockFetch({
      results: [{ name: "Buenos Aires", latitude: -34.6, longitude: -58.4, country: "Argentina" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await geocodeCity("Buenos Aires");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("name=Buenos%20Aires"),
    );
  });

  it("lanza error cuando la respuesta HTTP no es OK", async () => {
    vi.stubGlobal("fetch", mockFetch({}, false, "Service Unavailable"));

    await expect(geocodeCity("Madrid")).rejects.toThrow(
      "Error geocodificando: Service Unavailable",
    );
  });

  it("lanza error cuando la API devuelve resultados vacíos", async () => {
    vi.stubGlobal("fetch", mockFetch({ results: [] }));

    await expect(geocodeCity("XyzCiudadInexistente")).rejects.toThrow(
      'Ciudad no encontrada: "XyzCiudadInexistente"',
    );
  });

  it("lanza error cuando la API devuelve sin campo results", async () => {
    vi.stubGlobal("fetch", mockFetch({}));

    await expect(geocodeCity("Test")).rejects.toThrow('Ciudad no encontrada: "Test"');
  });

  it("funciona con ciudad que contiene caracteres especiales", async () => {
    const fetchMock = mockFetch({
      results: [{ name: "Medellín", latitude: 6.25, longitude: -75.56, country: "Colombia" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodeCity("Medellín");

    expect(result.name).toBe("Medellín");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("Medell%C3%ADn"));
  });
});
