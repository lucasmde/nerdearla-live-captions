# Texto para la entrega en Devpost

**Nombre del proyecto:** Live Captions — subtítulos simultáneos open source para conferencias

**Tagline (una línea):** Audio en vivo de cada escenario → subtítulos en tiempo real en el idioma original y traducidos, para 5, 10 o 30 sesiones en paralelo, con una web donde cada persona elige sesión e idioma.

## Inspiration

Nerdearla tiene más de 30 charlas en inglés, muchas en simultáneo, y hoy las subtitula con herramientas comerciales caras y operación manual. Casi todas las conferencias tienen el mismo problema. Quisimos que la mejor solución fuera abierta y que cualquier evento pudiera desplegarla en una tarde.

## What it does

- Toma el audio en vivo de cada escenario (consola web del operador con micrófono/línea, el audio de una pestaña, o cualquier fuente por ffmpeg: RTMP/SRT del streaming, dispositivo de captura, archivo).
- Transcribe en streaming con la Gemini Live API (`gemini-3.5-transcribe-live`): parciales en menos de un segundo y frases finales al terminar cada oración, con detección automática del idioma.
- Traduce cada frase a todos los idiomas configurados (español, inglés, portugués…) con un modelo Gemini flash-lite, con contexto de las frases anteriores para mantener la terminología; opcionalmente 100 % local con Gemma vía Ollama.
- Corre N sesiones en paralelo: un worker por escenario; agregar escenarios es agregar líneas en `sessions.json`.
- Vista para la audiencia: `/` lista las sesiones, `/s/<id>?lang=es` muestra los subtítulos grandes, con selector de idioma, tamaño de letra, ver el original debajo, y un modo overlay con fondo transparente para OBS/vMix o la pantalla de la sala.
- Panel de producción `/admin`: por sesión, si llega audio, estado del motor, latencia de subtítulos y traducción, audiencia conectada, errores.
- Glosario de términos técnicos y nombres propios por evento y por sesión.
- Export de la transcripción completa en SRT, VTT, TXT y JSON.
- Sesiones largas: rota la conexión con Gemini antes del límite del proveedor sin perder audio.

## How we built it

Node.js 22 + `ws` + `express`, sin frameworks pesados. `@google/genai` para la Live API (transcripción) y `generateContent` (traducción, con fallback automático a otros modelos si uno se satura). Frontend en HTML/CSS/JS vanilla con la identidad visual de Nerdearla; un AudioWorklet convierte el audio del navegador a PCM 16 kHz. Docker + docker compose, licencia Apache-2.0, README con guía de despliegue y manual de operación en `docs/MANUAL.md`.

## Challenges we ran into

Las hipótesis parciales de la Live API son acumulativas y a veces repiten texto ya finalizado; hubo que deduplicar para que el subtítulo no "salte". Los códigos de idioma del motor parpadean en frases cortas ("Hola a todos" → pt), lo resolvimos con una votación por mayoría entre el motor y un detector liviano. Y el nivel gratuito de la API limita a 15 traducciones por minuto por modelo, así que agrupamos todos los idiomas destino en una sola llamada y rotamos entre modelos.

## Accomplishments that we're proud of

Un despliegue completo con `docker compose up`, probado con audio real en dos escenarios simultáneos (inglés → español y español → inglés/portugués), con latencia sub-segundo en los parciales y ~0,5 s en la traducción de cada frase.

## What we learned

Que la transcripción en streaming ya es lo suficientemente buena para reemplazar el esquema manual, y que el trabajo real está en la operación: que un operador de sala pueda arrancarlo en un minuto y que producción vea de un vistazo qué escenario se quedó sin audio.

## What's next

STT local con whisper.cpp como motor alternativo, audio doblado en vivo (`gemini-live-translate`) como canal opcional, panel para crear sesiones sin reiniciar, diarización en paneles.

**Built with:** node.js, gemini, websockets, ffmpeg, docker, javascript

**Try it out:** repo en GitHub + demo online (URL del VPS).
