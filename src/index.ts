import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCurrentWeather, getForecast, getUvAndAir } from "./handlers.js";

const server = new McpServer(
  { name: "weather-mcp", version: "0.1.0" },
  { instructions: "Usa get_current_weather para el tiempo actual y get_forecast para el pronóstico de varios días." },
);

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
    const text = await getCurrentWeather(city);
    return { content: [{ type: "text", text }] };
  },
);

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
    const text = await getForecast(city, days);
    return { content: [{ type: "text", text }] };
  },
);

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
    const text = await getUvAndAir(city);
    return { content: [{ type: "text", text }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
