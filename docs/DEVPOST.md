# Texto para la entrega en Devpost

**Nombre del proyecto:** Live Captions — subtítulos y sala en vivo open source para conferencias

**Tagline (una línea):** Audio en vivo de cada escenario → subtítulos en tiempo real en el idioma original y traducidos a los que hagan falta, con una sala social (chat, mano alzada, audios) y agenda real integrada, para 5, 10 o 30 sesiones en paralelo.

**Demo pública:** https://nerdearla-live-captions.onrender.com · **Video (3 min):** https://youtu.be/35TdPJCY5dw · **Manual:** [docs/MANUAL.md](MANUAL.md) · **Evidencia (latencia/escala/costo):** [docs/EVIDENCIA.md](EVIDENCIA.md)

## Inspiration

Nerdearla tiene más de 30 charlas en simultáneo en varias salas y hoy se subtitulan con herramientas comerciales caras y operación manual. Casi todas las conferencias tienen el mismo problema. Quisimos que la mejor solución fuera abierta, gratis de operar (o casi) y que cualquier evento pudiera desplegarla en una tarde — y que la sala fuera algo más que subtítulos: un lugar donde la audiencia participa.

## What it does

- Toma el audio en vivo de cada escenario (consola web del operador con micrófono/línea, el audio de una pestaña, o cualquier fuente por ffmpeg: RTMP/SRT del streaming, dispositivo de captura, archivo).
- Transcribe en streaming con la Gemini Live API (`gemini-3.5-transcribe-live`): parciales en menos de un segundo y frases finales al terminar cada oración, con detección automática del idioma y rotación de sesión antes del límite del proveedor.
- Traduce cada frase a todos los idiomas configurados con un modelo Gemini flash-lite (una sola llamada para todos los destinos, con rotación automática entre modelos de respaldo si uno se satura por cuota), con glosario de términos técnicos y nombres propios por evento, sala y sesión; opcionalmente 100 % local con Gemma vía Ollama.
- **Agenda real del evento**: cada sala muestra qué charla está "ahora" y cuál "sigue" (con horario y orador), calculado en vivo contra la agenda cargada — no hay que adivinar a qué sesión entrar.
- **Sala social**, no solo subtítulos: chat con emojis, mensajes de audio cortos, mano alzada con aprobación del expositor (mientras alguien tiene la palabra, nadie más escribe hasta que se cierra), indicador en vivo de calidad de conexión/voz/latencia, resumen con IA de "¿Qué me perdí?" de los últimos minutos, botón de compartir sala (Web Share / copiar link), modo pausa y modo alto contraste.
- **Cuentas**: iniciar sesión con Google o GitHub, o entrar como invitado con nombre (nunca anónimo); cierre de sesión real; modo día/noche persistente; panel de admin con QR de cada sala.
- Vista para la audiencia: `/` lista las sesiones con la agenda en vivo, `/s/<id>?lang=es` muestra los subtítulos grandes con selector de idioma, tamaño de letra, ver el original debajo, y un modo overlay con fondo transparente para OBS/vMix o la pantalla de la sala (con QR de acceso).
- Panel de producción `/admin`: por sesión, si llega audio (con nivel dBFS y aviso de "sin señal"), estado del motor, latencia de subtítulos y traducción, audiencia conectada, errores, links directos a pantalla/QR/ticker.
- Integraciones de producción: métricas Prometheus en `/metrics`, ticker de texto/JSON para vMix/OBS (`now.txt`/`now.json`), export de la transcripción completa en SRT, VTT, TXT y JSON.
- Un click para desplegar: Render, Railway, Google Cloud Run o Kubernetes (`render.yaml`, `railway.json`, `deploy/cloudrun.sh`, `deploy/kubernetes.yaml`), además de Docker/`docker compose`.

## How we built it

Node.js 22 + `ws` + `express`, sin frameworks pesados. `@google/genai` para la Live API (transcripción) y `generateContent` (traducción y resúmenes, con fallback automático a otros modelos si uno se satura). Google Identity Services + una app OAuth propia de GitHub para el login social; cookie de sesión firmada con HMAC. `MediaRecorder`/`AudioWorklet` en el navegador para audio del micrófono y para los audios cortos del chat. Frontend en HTML/CSS/JS vanilla con la identidad visual de Nerdearla (colores y tipografías del evento). Docker + docker compose + manifiestos para Render/Railway/Cloud Run/Kubernetes, licencia Apache-2.0, README con guía de despliegue, manual de operación en `docs/MANUAL.md`, 14+ tests automáticos (`node --test`) corriendo en CI en cada push, y un benchmark propio (`tools/bench.js`) que mide latencia y costo de recursos con carga real.

## Challenges we ran into

Las hipótesis parciales de la Live API son acumulativas y a veces repiten texto ya finalizado; hubo que deduplicar para que el subtítulo no "salte". Los códigos de idioma del motor parpadean en frases cortas ("Hola a todos" → pt), lo resolvimos con una votación por mayoría entre el motor y un detector liviano. El nivel gratuito de la API limita a 15 traducciones por minuto por modelo, así que agrupamos todos los idiomas destino en una sola llamada y rotamos entre modelos de respaldo (ajustando esa lista cuando Google retira un modelo del nivel gratuito). Y coordinar chat + mano alzada + audio en tiempo real sin que se pisen los mensajes de distintos usuarios exigió un control de "quién puede escribir" del lado del servidor, no solo del cliente.

## Accomplishments that we're proud of

Una demo pública desplegada y funcionando con Gemini real (no un mock), probada de punta a punta con audio real en varias salas simultáneas, con latencia sub-segundo en los parciales y ~1-3 s en la traducción de cada frase incluso bajo el límite gratuito de cuota; benchmarks reproducibles que muestran 500 espectadores conectados en paralelo con menos de 5 ms de latencia de fan-out y menos del 5 % de CPU; y una sala que dejó de ser "solo subtítulos" para convertirse en un espacio donde la audiencia participa (mano alzada, chat con audio, resumen con IA).

## What we learned

Que la transcripción en streaming ya es lo suficientemente buena para reemplazar el esquema manual, y que el trabajo real está en la operación y en la experiencia social: que un operador de sala pueda arrancarlo en un minuto, que producción vea de un vistazo qué escenario se quedó sin audio, y que la audiencia tenga una razón para quedarse en la sala más allá de leer texto.

## What's next

STT local con whisper.cpp como motor alternativo (cero costo de API), audio doblado en vivo (`gemini-live-translate`) como canal opcional, panel para crear/editar sesiones sin reiniciar el servidor, diarización de oradores, escalado horizontal con Redis para eventos de miles de espectadores, un instalador de escritorio sin terminal para operadores no técnicos, y que el glosario de la sesión cambie automáticamente según la charla que está "ahora" en la agenda (hoy se acumulan todos los términos de la sala).

**Built with:** node.js, gemini, websockets, express, ffmpeg, docker, javascript, google identity services, github oauth

**Try it out:** repo en GitHub ([lucasmde/nerdearla-live-captions](https://github.com/lucasmde/nerdearla-live-captions)) + demo online: https://nerdearla-live-captions.onrender.com
