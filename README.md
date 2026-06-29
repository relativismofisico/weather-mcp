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

## Estructura del proyecto

```
weather-mcp/
├── src/
│   ├── index.ts          # Entrada: registro de herramientas MCP y arranque del servidor
│   ├── handlers.ts       # Lógica de negocio de las 3 herramientas (testeable de forma aislada)
│   ├── weather.ts        # Utilidades puras: geocodeCity, describeWeather, WMO_CODES
│   └── __tests__/
│       ├── weather.test.ts    # Tests de geocodificación y códigos WMO (9 tests)
│       └── handlers.test.ts   # Tests de herramientas con fetch mockeado (31 tests)
├── vitest.config.ts      # Configuración de tests y umbrales de cobertura (≥80%)
├── tsconfig.json
└── package.json
```

---

## Herramientas utilizadas

| Herramienta | Versión | Propósito |
|---|---|---|
| [TypeScript](https://www.typescriptlang.org/) | 5.8 | Lenguaje principal |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | 1.13 | Protocolo MCP (servidor stdio) |
| [Zod](https://zod.dev/) | 3.24 | Validación de esquemas de herramientas |
| [tsx](https://github.com/privatenumber/tsx) | 4.19 | Ejecución directa de TypeScript en desarrollo |
| [Vitest](https://vitest.dev/) | 3.x | Framework de tests unitarios |
| [@vitest/coverage-v8](https://vitest.dev/guide/coverage) | 3.x | Cobertura de código con motor V8 |
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

## Tests y cobertura

El proyecto usa [Vitest](https://vitest.dev/) con cobertura por V8. Los umbrales mínimos configurados son **80%** en todas las métricas; actualmente se alcanza el **100%**.

```bash
# Ejecutar todos los tests
npm test

# Tests en modo watch (desarrollo)
npm run test:watch

# Tests con reporte de cobertura
npm run test:coverage
```

### Resultado actual

```
-------------|---------|----------|---------|---------|
File         | % Stmts | % Branch | % Funcs | % Lines |
-------------|---------|----------|---------|---------|
handlers.ts  |     100 |      100 |     100 |     100 |
weather.ts   |     100 |      100 |     100 |     100 |
-------------|---------|----------|---------|---------|
All files    |     100 |      100 |     100 |     100 |
```

### Qué se testea

| Módulo | Tests | Casos cubiertos |
|---|---|---|
| `weather.ts` | 9 | Todos los códigos WMO, fallback para código desconocido, geocodificación exitosa, errores HTTP, ciudad no encontrada, caracteres especiales |
| `handlers.ts` | 31 | Día/noche, ubicación con y sin `admin1`, todos los rangos UV (Bajo→Extremo) y AQI (Buena→Insalubre), extracción de amanecer/atardecer, precipitación, propagación de errores HTTP en cada API |

Los tests mockean `fetch` globalmente con `vi.stubGlobal` — no se realizan llamadas reales a la red.

---

## Changelog

### v0.2.0 — 2026-06-29

- Refactorización: extracción de `weather.ts` (utilidades puras) y `handlers.ts` (lógica de herramientas) para habilitar tests unitarios sin dependencia del servidor MCP
- 40 tests unitarios con **100% de cobertura** (statements, branches, functions, lines)
- Configuración de Vitest con umbrales de cobertura ≥ 80%
- `coverage/` excluido del repositorio vía `.gitignore`

### v0.1.0 — 2026-06-29

- Implementación inicial del servidor MCP con transporte stdio
- Herramienta `get_current_weather`: temperatura, humedad, viento, precipitación y descripción del cielo
- Herramienta `get_forecast`: pronóstico de 1 a 7 días con amanecer/atardecer
- Herramienta `get_uv_and_air`: índice UV y calidad del aire (PM2.5, PM10, CO, AQI)
- Geocodificación automática de ciudad a coordenadas vía Open-Meteo Geocoding API
- Descripciones de cielo en español usando códigos WMO
- Sin API key requerida — 100% gratuito
