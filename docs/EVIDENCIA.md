# Evidencia: latencia, escala y costo

Mediciones reproducibles hechas con `node tools/bench.js` (incluido en el repo) el 25/09/2026 en un contenedor de **2 vCPU / Node 22**. El script levanta el servidor, mete audio en N sesiones en paralelo, conecta M espectadores por sesión y mide lo que reciben.

## 1. Escala: 10 escenarios × 50 espectadores (motor simulado)

```
node tools/bench.js --sessions 10 --viewers 50 --seconds 45
```

| Métrica | Valor |
|---|---|
| Sesiones en paralelo | 10 |
| Espectadores conectados (WebSocket) | 500 |
| Mensajes entregados | 94.750 (≈ 2.100/s) |
| Latencia servidor → espectador, parciales (p50 / p95 / máx) | 1 ms / 2 ms / 24 ms |
| Latencia servidor → espectador, finales (p50 / p95 / máx) | 1 ms / 2 ms / 5 ms |
| CPU del servidor (promedio / pico) | 4,2 % / 7 % de un núcleo |
| RAM del servidor (RSS pico) | 119 MB |

Conclusión: el proceso Node casi no trabaja; el costo real está en la API. Diez escenarios con 500 personas mirando entran en 1 vCPU / 512 MB.

## 2. Latencia real con Gemini: 3 escenarios × 20 espectadores

```
ENGINE=gemini node tools/bench.js --sessions 3 --viewers 20 --seconds 75 --audio demo/talk_en.mp3
```

| Métrica | Valor |
|---|---|
| Transcripción | `gemini-3.5-transcribe-live` (Live API, streaming PCM 16 kHz) |
| Traducción | `gemini-3.5-flash-lite` (+ modelos de respaldo ante 429) |
| Llamada de traducción (promedio, todos los idiomas destino en 1 llamada) | 1,5 s |
| Traducción disponible después de la frase final (p95 / máx) | 2,7 s / 3,2 s |
| Fan-out servidor → espectador (p95) | ≤ 4 ms |
| CPU / RAM del servidor | 5,8 % promedio (pico 16 %) / 101 MB |
| Errores de traducción | 23 de 920 (cuota gratuita, 15 req/min por modelo; el sistema rotó al modelo de respaldo y no se perdió ninguna frase) |

Observado en pruebas manuales con micrófono (no instrumentado): la primera palabra aparece como **parcial ~1 s** después de decirla; la frase final se cierra al terminar de hablar (`endOfAudio`/pausa) y la traducción llega 1–3 s después. Con `TRANSLATE_PARTIALS=1` la traducción parcial acompaña al texto mientras se habla (cada 2,5 s por defecto).

## 3. Costo estimado

Por escenario y hora, con precios públicos de Gemini (ver https://ai.google.dev/pricing): una sesión Live de transcripción continua y ~600 llamadas de traducción cortas con `flash-lite` cuestan **pocos dólares por hora de escenario**; el servidor en sí corre en la instancia más chica de cualquier proveedor. Con `TRANSLATOR=ollama` (Gemma local) la traducción cuesta cero en API.

Recomendación para producción: activar facturación en Google Cloud para salir del nivel gratuito (15 req/min por modelo). En el nivel gratuito el sistema sigue funcionando gracias a la rotación de modelos, pero con más latencia en la traducción bajo carga.

## 4. Pruebas automáticas

```
npm test
```

- `test/unit.test.js`: detección de idioma, pipeline de sesión (finales una sola vez, corte en oraciones, parciales sin repetir texto ya finalizado, persistencia JSONL) y cookies de sesión firmadas.
- `test/e2e.test.js`: levanta el servidor real en modo simulado y verifica de punta a punta: audio → parcial → final → traducción, presencia, chat, exportación por rango horario (TXT/VTT), agregado de idioma a pedido de un espectador y respuesta del endpoint de mail sin proveedor.

Se ejecutan en GitHub Actions en cada push (`.github/workflows/ci.yml`).

## 5. Reproducir

```bash
npm ci
npm test
node tools/bench.js --sessions 10 --viewers 50 --seconds 45
GEMINI_API_KEY=... ENGINE=gemini node tools/bench.js --sessions 3 --viewers 20 --seconds 75 --audio demo/talk_en.mp3
```
