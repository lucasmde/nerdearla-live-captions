# Live Captions — Resumen de cierre (Nerdearla Vibeathon 2026)

Repo: https://github.com/lucasmde/nerdearla-live-captions · Demo: https://nerdearla-live-captions.onrender.com
Video: https://youtu.be/35TdPJCY5dw · Devpost: https://devpost.com/software/live-captions-o0wh8q

## 1. Cuadro comparativo y ranking de competencia

Basado en el análisis de los 7 proyectos de subtitulado/traducción en vivo relevados en el Vibeathon. Escala: ✅ tiene y funciona bien · ~ parcial/básico · ❌ no tiene.

| Feature | **Live Captions (nosotros)** | everyone-makes-subs | subtitulos-en-vivo | LinguaStream | CaptionLive | cotorra | transcriba | subtitula |
|---|---|---|---|---|---|---|---|---|
| STT streaming en vivo | ✅ Gemini Live | ✅ Whisper local | ✅ | ~ (por lotes) | ✅ | ~ | ✅ | ✅ |
| Traducción multi-idioma en 1 sesión | ✅ (N idiomas, 1 llamada) | ~ (1 idioma) | ~ | ❌ | ~ | ❌ | ❌ | ✅ (pero switching real por charla) |
| Múltiples salas/escenarios en paralelo | ✅ | ❌ | ~ | ❌ | ~ | ❌ | ❌ | ✅ |
| Agenda real del evento integrada | ✅ (ahora/después) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ~ (glosario dinámico por charla) |
| Chat / interacción de audiencia | ✅ (emojis, audio, mano alzada) | ❌ | ❌ | ~ (chat simple) | ❌ | ✅ (fuerte, es su foco) | ❌ | ❌ |
| Login social (Google/GitHub) | ✅ | ❌ | ❌ | ✅ (Google) | ❌ | ✅ | ❌ | ❌ |
| Indicador de calidad/latencia en vivo | ✅ | ❌ | ❌ | ❌ | ~ | ❌ | ❌ | ❌ |
| Accesibilidad (alto contraste, pausa) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ~ |
| Modo día/noche | ✅ | ❌ | ~ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Export SRT/VTT/TXT/JSON | ✅ | ~ (TXT) | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Panel admin/producción | ✅ (con métricas) | ❌ | ~ | ❌ | ✅ | ❌ | ~ | ✅ |
| Overlay OBS/vMix + ticker | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Métricas Prometheus | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Un click a la nube (Render/Railway/CR/K8s) | ✅ (4 plataformas) | ❌ | ❌ | ~ (Vercel) | ❌ | ❌ | ❌ | ❌ |
| Tests automáticos + CI | ✅ (14+, CI) | ❌ | ❌ | ~ | ❌ | ❌ | ❌ | ~ |
| Benchmarks de carga/latencia publicados | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| STT 100% local sin costo de API | ❌ (roadmap) | ✅ (Whisper.cpp) | ❌ | ❌ | ❌ | ❌ | ~ | ❌ |
| Doblaje / voz traducida en vivo | ❌ (roadmap) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Instalador de escritorio sin terminal | ❌ | ❌ | ✅ (su fuerte) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Intérprete de lengua de señas embebido | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (nicho) | ❌ |
| Glosario dinámico por charla actual (no unión estática) | ❌ (unión estática, ver §3) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Ranking de amenaza real

1. **everyone-makes-subs** — único rival serio: apuesta fuerte a Whisper local (cero costo de API, funciona sin internet), lo cual es un argumento real frente al costo de Gemini. Nos falta esa opción (está en roadmap). En todo lo demás (salas paralelas, agenda, chat, accesibilidad, producción, tests, deploy) estamos claramente adelante.
2. **subtitula** — el más completo en la parte de traducción pura (switching de glosario por charla en curso), pero sin salas paralelas, sin interacción de audiencia, sin producción/monitoreo, sin tests ni benchmarks. Competidor de nicho en "calidad de traducción", no en producto completo.
3. **subtitulos-en-vivo** — fuerte en distribución (instalador de escritorio), débil en todo lo demás; útil para robar la idea del instalador, no una amenaza de producto.
4. **cotorra** — el único con foco social real (chat/interacción), pero sin transcripción multi-sala ni producción; su punto fuerte (interacción) ya lo igualamos y superamos (chat+emojis+audio+mano alzada+resumen IA).
5. **LinguaStream, CaptionLive, transcriba** — proyectos parciales/congelados desde la mañana (sin commits nuevos ni cambios de estado detectados en el último análisis), cada uno cubre 1-2 features puntuales que ya tenemos igualadas o superadas.

**Conclusión:** de los 7 relevados, ninguno cubre el conjunto completo (transcripción multi-sala + traducción + agenda real + interacción social + producción + accesibilidad + observabilidad + un-click deploy + tests/benchmarks) que tiene esta entrega. El riesgo real no es "que nos alcancen en features" sino que el jurado valore mucho el ángulo "100% local, sin costo" de everyone-makes-subs — por eso ese ítem (Whisper local) es el primero de la lista de v3 abajo.

*Nota de honestidad: este ranking se arma sobre el relevamiento hecho durante el evento; no volví a re-scrapear los 7 repos en esta pasada final ni confirmé si el listado de submissions de Devpost ya es público (para revisar si hay proyectos nuevos que no vimos). Si querés que lo vuelva a correr con una revisión fresca antes de que cierre el jurado, decime y lo hago.*

## 2. Backlog "versión 3" — qué sumar y de dónde sale la idea

| Prioridad | Feature | Inspirado en | Esfuerzo estimado |
|---|---|---|---|
| Alta | STT local con whisper.cpp como motor alternativo (cero costo de API, funciona offline) | everyone-makes-subs | Medio-alto (nuevo `engines/whisper.js`, requiere binario/modelo local) |
| Alta | Glosario dinámico por charla **en curso**, no unión estática de toda la sala (hoy `session.js` mergea *todos* los oradores de la sala en un solo vocabulario, ver §3) | subtitula | Bajo — ya tenemos `agendaNow()`, solo hay que recalcular `vocabulary` en cada tick en vez de una sola vez al boot |
| Media | Doblaje/voz traducida en vivo (`gemini-live-translate` o TTS + audio track opcional) | roadmap propio, nadie lo tiene aún | Alto |
| Media | Instalador de escritorio sin terminal (Electron o script único con túnel automático) para operadores no técnicos | subtitulos-en-vivo | Medio |
| Media | Diagrama de arquitectura (Mermaid) en el README | LinguaStream, cotorra (lo mencionan como ventaja de claridad) | Muy bajo |
| Media | Archivo/descarga de transcripciones por charla ya finalizada, navegable por evento (no solo por sesión activa) | subtitula, transcriba | Medio |
| Baja | Escalado horizontal con Redis pub/sub para +1000 espectadores en múltiples instancias | ninguno lo tiene, pero es la objeción típica de escala | Alto |
| Baja | CLI de salud pre-evento (chequea claves, cuota, sesiones, puertos antes de la charla) | ninguno lo tiene | Bajo |
| Baja | Watchdog que reabra sola una sesión de Gemini si se cuelga sin operador mirando el admin | ninguno lo tiene | Medio |
| Baja | Demo de respaldo gratis (GitHub Pages, "cassette" grabado) por si se cae el Render pago | ninguno lo tiene | Bajo |
| Baja | Intérprete de lengua de señas embebido (nicho de accesibilidad) | transcriba | Alto (depende de proveedor externo) |

## 3. Auditoría de contenido desactualizado en el repo — qué encontré y qué corregí

- ✅ **Corregido ahora:** `docs/DEVPOST.md` estaba completamente desactualizado — describía la v1 (sin chat, sin login social, sin agenda, sin métricas, sin deploys de un click, sin tests/CI, sin URL de demo). Lo reescribí completo para que coincida con lo que hoy está en vivo y en Devpost.
- ✅ Revisado, están al día: `README.md` (video, demo, badges), `.env.example` (incluye todas las variables v2: GitHub OAuth, guest access, etc.), `docs/EVIDENCIA.md` (números y metodología coinciden con `tools/bench.js` actual), `docs/MANUAL.md` (contenido correcto, ver limitación abajo), `render.yaml`/`railway.json`/`deploy/*` (coinciden con `server/config.js` actual).
- ✅ Confirmado: `main` y `v2` están sincronizados en GitHub en el mismo commit (`bc08a98`), sin divergencia pendiente.
- ⚠️ **Gap real de comportamiento, no de docs:** confirmé en `server/config.js`/`session.js` que el "glosario por sesión" hoy es una **unión estática** de los oradores de *todas* las charlas de la sala (calculada una vez al arrancar), no un glosario que cambia según qué charla está "ahora". Es el ítem de más arriba en la tabla de v3 — barato de arreglar porque ya existe `agendaNow()` para calcular la charla actual, solo falta recalcular el vocabulario activo en cada `partial()`/`final()` en vez de una vez al boot.
- Pendiente de revisar (no llegué a auditarlo en esta pasada, lo dejo en el checklist): `LICENSE`/`CONTRIBUTING.md` si existen, metadata de `package.json` (nombre/descripción/autor), y si `docs/MANUAL.md` referencia capturas de pantalla que ya no reflejan la UI actual.

## 4. Manual descargable con imágenes — qué se puede hacer

Hoy `docs/MANUAL.md` es texto plano en GitHub, sin una sola imagen embebida, aunque ya existen capturas en `docs/img/*.png` y 6 capturas nuevas de la versión actual (`/mnt/user-data/outputs/01-salas-agenda.jpg` … `06-modo-dia.jpg`, sacadas de fotogramas del video v2). Opciones concretas, de menor a mayor esfuerzo:

1. **Ahora mismo, sin nada nuevo:** en el campo de "links" de Devpost agregar un link directo a `docs/MANUAL.md` renderizado por GitHub (`https://github.com/lucasmde/nerdearla-live-captions/blob/main/docs/MANUAL.md`) — ya se ve razonablemente bien porque GitHub renderiza el Markdown, y si le embebo las imágenes existentes (`![](../docs/img/index.png)` etc.) queda ilustrado sin trabajo extra de hosting.
2. **Manual HTML con imágenes embebidas, autocontenido:** genero una página HTML (todas las capturas como `data:` URIs, con el estilo Nerdearla) a partir del contenido de `MANUAL.md` + las 6+ capturas disponibles, y la publico como página propia (no depende de GitHub Pages ni de configurar nada en el repo) — queda con URL propia para linkear desde Devpost y se puede compartir aparte del repo.
3. **PDF descargable con capturas:** genero un PDF del manual (mismo contenido + imágenes) para que en Devpost, además del link, haya un archivo descargable de un click.

Recomiendo la combinación (1) embebiendo las imágenes en `MANUAL.md` mismo (barato, mejora el repo para siempre) + (2) como página aparte para linkear desde el perfil de Devpost. **¿Querés que lo arme ahora?** Es rápido (ya tengo las 6 capturas nuevas más las que ya estaban en `docs/img/`) — si me confirmás te lo dejo las dos versiones listas.

## 5. Ideas útiles de otros proyectos presentados (más allá de los 7 ya comparados)

No llegué a revisar si la galería completa de submissions del Vibeathon ya es pública (la última vez que se chequeó devolvía "aún no publicada"). Si ya se abrió, valdría la pena una segunda pasada — decime y la corro. De los 7 que sí pude ver, lo más aprovechable que **no** está ya en el backlog de v3 de arriba:
- El enfoque de **subtitulos-en-vivo** de "cero fricción para el operador" (doble click, sin configurar nada) — ya lo tenemos parcialmente con los scripts `start.sh`, pero un instalador real sería la versión pulida (ítem en la tabla de v3).
- El **glosario dinámico** de subtitula ya está listado arriba como el gap más barato de cerrar.
- Nada más de los 7 aporta algo que no esté ya cubierto o listado.

## 6. Checklist de pendientes del proyecto (operativo + producto)

**Operativo / tuyo:**
- [ ] Borrar u ocultar los videos viejos de "Live Captions" en tu canal de YouTube (dejé el nuevo: https://youtu.be/35TdPJCY5dw) — esto lo tenés que hacer vos, no lo hago yo sobre tu cuenta sin que me digas cuáles.
- [ ] Confirmar que activaste facturación en Google Cloud si querés salir del límite gratuito de Gemini (15 req/min) para la demo en vivo del jurado.
- [ ] Rotar la `GEMINI_API_KEY` después del evento si la compartiste en algún lado público.
- [ ] Hacer una revisión visual final de la página de Devpost ya publicada (por las dudas, después de todos los cambios automáticos).
- [ ] Decidir si querés que arme ya el manual con imágenes (HTML/PDF) — ver punto 4.
- [ ] Confirmar si la galería de submissions del Vibeathon ya está pública, para una segunda pasada de competidores si da tiempo.

**Producto (v3, después del evento):**
- [ ] Glosario dinámico por charla actual (barato, alto impacto).
- [ ] Diagrama Mermaid de arquitectura en el README (muy barato).
- [ ] STT local (whisper.cpp) como motor alternativo.
- [ ] Doblaje/voz traducida en vivo.
- [ ] Instalador de escritorio sin terminal.
- [ ] Archivo navegable de transcripciones pasadas por evento.
- [ ] Escalado horizontal (Redis) para eventos grandes.
- [ ] CLI de chequeo de salud pre-evento + watchdog de sesiones colgadas.
- [ ] Demo de respaldo gratuita (GitHub Pages / grabación) por si falla el hosting pago.

---
Repo al día en `bc08a98` (main y v2 sincronizados) + el fix de `docs/DEVPOST.md` de este cierre, que subo a continuación.
