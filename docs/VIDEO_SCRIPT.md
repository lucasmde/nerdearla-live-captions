# Guion de grabación — video de demo completo

Guion pensado para grabar en una sola pasada (o en bloques cortos que se pegan sin edición
compleja), siguiendo el mismo orden que la [guía paso a paso del manual](MANUAL.md#41-guía-paso-a-paso-armar-una-sala-y-ponerla-en-vivo-de-punta-a-punta):
**admin crea la sala → admin genera el código de orador → el orador conecta el audio (dos
caminos) → la audiencia usa todas las funciones → producción monitorea.**

Grabar en 1920×1080, Chrome con el zoom al 100%, ventana maximizada. Subir cursor grande /
resaltado de clicks si el software de grabación lo permite — ayuda mucho a que se entienda
cada paso en pantalla completa.

## Pestañas a preparar antes de grabar

1. `https://nerdearla-live-captions.onrender.com/` — portada de salas.
2. `https://nerdearla-live-captions.onrender.com/admin/sessions` — panel de admin (logueado
   con una cuenta de `ADMIN_EMAILS`).
3. `https://nerdearla-live-captions.onrender.com/operator/gran-sala` — consola de operador,
   **en una ventana de incógnito o con otra cuenta de Google** (para mostrar el flujo del
   código de orador desde cero, sin permisos previos).
4. `https://nerdearla-live-captions.onrender.com/s/gran-sala?lang=es` — vista de audiencia,
   sesión iniciada con una tercera cuenta (para mostrar chat, mano alzada, etc.).
5. `https://nerdearla-live-captions.onrender.com/s/gran-sala?lang=en` — la misma sala en
   inglés, en el celular o en otra ventana, para mostrar el cambio de idioma en vivo.
6. `https://nerdearla-live-captions.onrender.com/admin` — panel de producción.
7. Una pestaña de YouTube con una charla en inglés reproduciéndose (para el camino
   "pestaña de streaming" del orador) — cualquier charla técnica sirve.
8. `docs/manual.pdf` abierto, para el cierre.

## Bloques

**0:00–0:15 — Cold open**
Portada (pestaña 1): mostrar las salas con sus charlas actuales/siguientes, la cuenta
regresiva y cuántas hay en vivo en simultáneo. Narración: *"Live Captions: subtítulos en
vivo con traducción, para todas las salas de una conferencia en simultáneo, con licencia
abierta para que cualquier evento lo instale gratis."*

**0:15–0:40 — El admin arma la sala**
Pestaña 2 (`/admin/sessions`). Mostrar la cabecera con el mail logueado y el botón **Cerrar
sesión**. Crear una sala nueva en vivo (id, nombre, ubicación, idiomas) o abrir una
existente y cargar una charla en la agenda (título, orador, horario). Narración: *"Quien
organiza el evento arma las salas y la agenda sin tocar un archivo ni reiniciar el
servidor."*

**0:40–1:00 — El código de orador**
En la misma sala, apretar **🔑 Código de orador**. Mostrar el código de 6 dígitos grande en
pantalla y leerlo en voz alta. Narración: *"Cuando no se sabe de antemano el mail de quien
va a hablar, se genera un código temporal por sala — nadie necesita estar en ninguna
lista."*

**1:00–1:35 — El orador conecta el audio: camino 1, micrófono**
Cambiar a pestaña 3 (`/operator/gran-sala`, sesión sin permisos). Mostrar el cuadro
**Habilitar como orador de esta sala**: iniciar sesión con Google, cargar el código leído
en el paso anterior, confirmar. Elegir **🎤 Detectar micrófono** (hablar mientras corre la
detección) y apretar **▶ Iniciar con micrófono**. Mostrar el medidor de nivel moviéndose y
el preview de "Últimos subtítulos" llenándose en vivo mientras se habla a cámara. Narración:
*"El orador entra, pone el código que le pasaron, y con un clic ya está transmitiendo — acá
mismo ve confirmado que está funcionando antes de arrancar la charla."*

**1:35–1:55 — El orador conecta el audio: camino 2, pestaña de streaming**
Apretar **■ Detener**. Cambiar la fuente: apretar **▶ Capturar audio de una pestaña**, elegir
en el selector de Chrome la pestaña de YouTube preparada (pestaña 7) y tildar "Compartir
audio de la pestaña". Mostrar que el preview sigue funcionando igual, ahora con el audio de
esa charla en inglés. Narración: *"Si la charla llega por Zoom, Meet o YouTube en vez de un
micrófono físico, es la misma consola: se captura el audio de esa pestaña del navegador."*

**1:55–2:35 — Lo que ve la audiencia**
Cambiar a pestaña 4 (`/s/gran-sala?lang=es`, sesión iniciada). Mostrar los subtítulos en
vivo traduciéndose, el botón **ORIG** (frase original debajo), **A−/A+**. Abrir ⚙ → **¿Qué
me perdí?** y mostrar el resumen con IA. Abrir el chat 💬: mandar un mensaje, levantar la
mano ✋. Mostrar la tarjeta de cuenta en la cabecera con **Cerrar sesión**. Narración: *"La
audiencia elige sala e idioma desde el celular, puede repasar lo que se perdió con un
resumen de IA, chatear, pedir la palabra, y todo funciona igual logueado o como invitado de
solo lectura."*

**2:35–2:50 — Multi-idioma y multi-sala en simultáneo**
Mostrar pestaña 5 (`?lang=en`) lado a lado con la 4, mismos subtítulos en dos idiomas al
mismo tiempo. Volver a la portada y mostrar el selector ▾ de sala cambiando entre las 4
salas del evento sin recargar. Narración: *"Cada persona elige su propio idioma, y el
sistema corre varias salas del evento al mismo tiempo sin perder sincronía."*

**2:50–3:05 — Integraciones de producción**
Pestaña 6 (`/admin`): mostrar la tabla con audio, motor, traducción, errores y audiencia de
las 4 salas en vivo. Mencionar rápido, superpuesto en pantalla o narrado: overlay para OBS
(`&overlay=1`), pantalla con QR (`&tv=1`), `now.txt` para vMix, exportación SRT/VTT/TXT, y
envío de la transcripción por mail. Narración: *"Todo queda monitoreado en un panel central,
con métricas para Grafana, y se integra directo con OBS, vMix y pantallas de sala."*

**3:05–3:20 — Cierre**
Volver a la portada. Mostrar el manual en PDF (pestaña 8) pasando un par de páginas.
Narración de cierre: *"Node.js, licencia Apache 2.0, deploy con un clic en Render, Railway,
Cloud Run o Kubernetes, y manual completo paso a paso — para que cualquier conferencia lo
use gratis."* Mostrar el link del repo en pantalla.

## Después de grabar

- Subir a YouTube (no listado o público, como prefiera Lucas) y actualizar el link en
  `README.md` (badge/link de "Video") y en `docs/DEVPOST.md` / la descripción de Devpost.
- Si se graba en bloques separados, un editor simple (o `ffmpeg -f concat`) alcanza para
  pegarlos sin necesidad de transiciones.
