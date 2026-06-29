# weather-mcp

Servidor MCP para consultar el tiempo en cualquier ciudad del mundo, usando la API gratuita de [Open-Meteo](https://open-meteo.com). Sin registro, sin API key.

---

## Arquitectura y componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code / IA                         │
│                  (cliente MCP — cualquier host)                 │
└────────────────────────┬────────────────────────────────────────┘
                         │  stdio (JSON-RPC)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      weather-mcp (este servidor)                │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    MCP Server                           │   │
│   │         @modelcontextprotocol/sdk  +  Zod               │   │
│   │                                                         │   │
│   │  ┌─────────────────┐  ┌─────────────────┐              │   │
│   │  │get_current_      │  │  get_forecast   │              │   │
│   │  │weather           │  │  (1–7 días)     │              │   │
│   │  └────────┬────────┘  └────────┬────────┘              │   │
│   │           │                    │                        │   │
│   │  ┌────────▼────────────────────▼────────┐              │   │
│   │  │         get_uv_and_air               │              │   │
│   │  │    (índice UV + calidad del aire)    │              │   │
│   │  └──────────────────┬───────────────────┘              │   │
│   │                     │                                   │   │
│   │  ┌──────────────────▼───────────────────┐              │   │
│   │  │           Geocoding helper            │              │   │
│   │  │  ciudad → latitud / longitud          │              │   │
│   │  └──────────────────┬───────────────────┘              │   │
│   └─────────────────────┼───────────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────────┘
                          │  HTTPS (fetch nativo Node 18+)
          ┌───────────────┼───────────────────────┐
          ▼               ▼                       ▼
┌──────────────┐ ┌────────────────┐ ┌─────────────────────────┐
│  Geocoding   │ │    Forecast    │ │      Air Quality         │
│  API         │ │    API         │ │      API                 │
│  open-meteo  │ │  open-meteo   │ │  air-quality.open-meteo  │
└──────────────┘ └────────────────┘ └─────────────────────────┘
```

### Flujo de una consulta

```
IA: "¿Qué tiempo hace en Bogotá?"
        │
        ▼
1. MCP llama get_current_weather({ city: "Bogotá" })
        │
        ▼
2. geocodeCity("Bogotá")
   → GET geocoding-api.open-meteo.com/v1/search
   ← { latitude: 4.71, longitude: -74.07, country: "Colombia" }
        │
        ▼
3. GET api.open-meteo.com/v1/forecast
   ← temperatura, humedad, viento, código WMO, precipitación
        │
        ▼
4. Respuesta formateada en texto legible
   → IA la presenta al usuario
```

---

## Herramientas utilizadas

| Herramienta | Versión | Propósito |
|---|---|---|
| [TypeScript](https://www.typescriptlang.org/) | 5.8 | Lenguaje principal |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | 1.13 | Protocolo MCP (servidor stdio) |
| [Zod](https://zod.dev/) | 3.24 | Validación de esquemas de herramientas |
| [tsx](https://github.com/privatenumber/tsx) | 4.19 | Ejecución directa de TypeScript en desarrollo |
| [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | — | Datos meteorológicos actuales y pronóstico |
| [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) | — | Conversión ciudad → coordenadas |
| [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | — | Índice UV y calidad del aire |

---

## Instalación

### Requisitos

- Node.js 18 o superior
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/relativismofisico/weather-mcp.git
cd weather-mcp

# 2. Instalar dependencias y compilar
npm install
npm run build

# 3. Registrar en Claude Code (global — disponible en cualquier proyecto)
claude mcp add weather --transport stdio --scope user -- node /ruta/absoluta/weather-mcp/dist/index.js
```

> En Windows usa la ruta completa con barras normales:
> `node C:/Users/TuUsuario/weather-mcp/dist/index.js`

### Verificar la instalación

```bash
claude mcp list
# weather: node .../dist/index.js - ✔ Connected
```

---

## Uso desde una IA

Una vez registrado, abre una **nueva conversación** en Claude Code. Las herramientas estarán disponibles automáticamente. Puedes pedirle a la IA:

### Tiempo actual

> *"¿Qué tiempo hace en Buenos Aires?"*
> *"Dame la temperatura actual en Tokio"*
> *"¿Está lloviendo en Londres ahora mismo?"*

### Pronóstico

> *"Dame el pronóstico de 7 días para Ciudad de México"*
> *"¿Cómo va a estar el tiempo en París esta semana?"*

### UV y calidad del aire

> *"¿Cuál es el índice UV en Medellín hoy?"*
> *"¿La calidad del aire en Beijing es buena?"*

### Ejemplo de respuesta

```
📍 Buenos Aires, Ciudad Autónoma de Buenos Aires, Argentina
🕐 2026-06-29T14:00 (hora local)  ☀️ Día

🌡️  Temperatura:      18°C  (sensación 16°C)
💧 Humedad:           65%
🌬️  Viento:           22 km/h  (dirección 180°)
🌧️  Precipitación:    0 mm
☁️  Cielo:            Parcialmente nublado
```

---

## Herramientas MCP expuestas

### `get_current_weather`

Obtiene el tiempo actual de una ciudad.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `city` | `string` | Nombre de la ciudad (ej. `"Madrid"`, `"New York"`) |

**Datos devueltos:** temperatura, sensación térmica, humedad, velocidad y dirección del viento, precipitación, descripción del cielo (código WMO), si es de día o noche.

---

### `get_forecast`

Pronóstico diario de hasta 7 días.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `city` | `string` | Nombre de la ciudad |
| `days` | `number` | Días del pronóstico (1–7, por defecto 5) |

**Datos devueltos por día:** temperatura máx/mín, lluvia acumulada, viento máximo, hora de amanecer y atardecer, descripción del cielo.

---

### `get_uv_and_air`

Índice UV actual y calidad del aire.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `city` | `string` | Nombre de la ciudad |

**Datos devueltos:** índice UV con etiqueta (Bajo / Moderado / Alto / Muy alto / Extremo), AQI (US), PM2.5, PM10, monóxido de carbono.

---

## Desarrollo

```bash
# Ejecutar en modo desarrollo (sin compilar)
npm run dev

# Compilar
npm run build

# Probar con MCP Inspector
npx @modelcontextprotocol/inspector
# → seleccionar "stdio", comando: node dist/index.js
```

---

## Changelog

### v0.1.0 — 2026-06-29

- Implementación inicial del servidor MCP con transporte stdio
- Herramienta `get_current_weather`: temperatura, humedad, viento, precipitación y descripción del cielo
- Herramienta `get_forecast`: pronóstico de 1 a 7 días con amanecer/atardecer
- Herramienta `get_uv_and_air`: índice UV y calidad del aire (PM2.5, PM10, CO, AQI)
- Geocodificación automática de ciudad a coordenadas vía Open-Meteo Geocoding API
- Descripciones de cielo en español usando códigos WMO
- Sin API key requerida — 100% gratuito
