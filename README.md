# Follower Remover

> **English summary.** Local web app to see **when each Instagram follower started following you** and to **remove followers in bulk by date range** (for example, a wave of bot accounts that arrived in one month). Dates come from Instagram's own data export; removals run through a Tampermonkey userscript inside your logged-in instagram.com session, with random pauses and an hourly cap. The app never asks for your password. Built with Node 24, TypeScript, Express and `node:sqlite` in a hexagonal architecture. The rest of this README is in Spanish.

Aplicación web local para ver **cuándo te siguió cada seguidor de Instagram** y **eliminar seguidores en lote filtrando por fechas**.

> Instagram no ofrece API oficial ni para conocer la fecha de seguimiento ni para quitar seguidores.
> Las fechas salen de tu propia exportación de datos; las eliminaciones las ejecuta un userscript
> dentro de tu sesión ya iniciada en instagram.com, con pausas y tope por hora. La app nunca pide tu contraseña.

## Requisitos

- Node.js ≥ 22.13 (usa `node:sqlite`, sin dependencias nativas). Hay un `.nvmrc` con la 24.
- Extensión [Tampermonkey](https://www.tampermonkey.net/) en el navegador donde tienes Instagram abierto.

## Puesta en marcha

```bash
npm install
npm run seed      # opcional: 1 500 seguidores ficticios para probar la interfaz
npm run dev       # http://127.0.0.1:4310
```

Variables opcionales: `PORT` (4310), `HOST` (127.0.0.1), `DATABASE_PATH` (`data/instagram-remover.db`).

## Flujo de uso

1. **Pide tu exportación** en Instagram: Configuración → Centro de cuentas → Tu información y permisos → Descargar tu información → *Algunos datos* → *Seguidores y seguidos*, rango **Desde el principio** (con "último año" solo verás ese periodo), formato JSON o HTML (ambos se importan).
2. **Importa** los `followers_1.json` o `followers_1.html` (y numerados siguientes; carpeta `connections/followers_and_following/`) arrastrándolos en la pestaña *Importar datos*, o por terminal:
   ```bash
   npm run import -- ~/Downloads/instagram-tuusuario-2026-11-10
   ```
   Reimportar una exportación nueva actualiza fechas y detecta a quien te volvió a seguir tras eliminarlo.
3. **Filtra y selecciona** en la pestaña *Seguidores*: por mes (clic; Mayús + clic extiende el rango), por rango de fechas, por nombre. "Seleccionar todos los filtrados" y "Enviar a la cola de eliminación".
4. **Instala el userscript** desde la pestaña *Ejecutor* (enlace `/userscript/instagram-remover.user.js`; la URL de la API va inyectada).
5. Abre **instagram.com** con tu sesión. Aparece un panel abajo a la derecha. Déjalo primero en **Simulación** para verificar que resuelve usuarios; luego desactívala y pulsa **Iniciar**. El panel permite ajustar pausa mínima/máxima y máximo por hora. Si Instagram devuelve 429, 401/403 o pide verificación, el script devuelve el trabajo a la cola y se pausa 30 minutos.
6. La pestaña *Cola de eliminación* se refresca sola: pendientes, en proceso, hechos, fallidos (reintentables) y cancelados.

## Arquitectura hexagonal

```
src/
├── domain/                      Núcleo sin dependencias externas
│   ├── follower.ts              Entidad Follower, estados, reconciliación con exportaciones nuevas
│   ├── removal-job.ts           Entidad RemovalJob y máquina de estados (pending→processing→done|failed…)
│   ├── date-range.ts            Value object DateRange
│   ├── errors.ts                DomainError
│   └── ports/                   Puertos de salida (interfaces)
│       ├── follower-repository.ts
│       ├── removal-queue-repository.ts
│       ├── follower-export-parser.ts
│       └── clock.ts
├── application/                 Casos de uso (puertos de entrada)
│   ├── import-followers.ts      ImportFollowers
│   ├── list-followers.ts        ListFollowers
│   ├── get-follower-stats.ts    GetFollowerStats (resumen + desglose mensual)
│   ├── enqueue-removals.ts      EnqueueRemovals
│   ├── claim-next-removal.ts    ClaimNextRemoval (lo usa el userscript)
│   ├── report-removal-result.ts ReportRemovalResult (lo usa el userscript)
│   ├── manage-queue.ts          ManageQueue (cancelar, liberar, reintentar, limpiar)
│   └── index.ts                 buildUseCases(deps)
├── adapters/
│   ├── inbound/
│   │   ├── http/                Express: /api/* + sirve public/ y el userscript
│   │   └── cli/                 `npm run import -- <carpeta>`
│   └── outbound/
│       ├── instagram-export/    Parsers JSON y HTML de "Descargar tu información" + autodetección
│       ├── persistence/sqlite/  Repositorios sobre node:sqlite
│       ├── persistence/in-memory/  Repositorios para pruebas
│       └── system-clock.ts
├── bootstrap.ts                 Raíz de composición (puertos ↔ adaptadores)
├── config.ts
└── main.ts                      Arranque del servidor HTTP
public/                          Interfaz web (HTML/CSS/JS sin build)
userscript/                      Ejecutor para Tampermonkey (adaptador externo que consume /api/queue)
tests/                           Vitest: dominio y casos de uso con adaptadores en memoria + repositorios SQLite
```

Reglas de dependencia: `domain` no importa nada; `application` solo importa `domain`; los `adapters` importan `application`/`domain` y nunca entre sí; `bootstrap.ts` es el único sitio que conoce las implementaciones concretas.

## API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/stats` | Totales de seguidores y de la cola |
| GET | `/api/followers?from&to&q&status&sort&page&pageSize` | Listado paginado |
| GET | `/api/followers/usernames?…` | Todos los usernames que cumplen el filtro |
| GET | `/api/followers/months` | Conteo por mes |
| POST | `/api/imports` `{ documents: [...] }` | Importar archivos de exportación (texto JSON/HTML o JSON ya parseado) |
| POST | `/api/queue` `{ usernames: [...] }` | Encolar |
| GET | `/api/queue?status` | Listar cola |
| POST | `/api/queue/claim` | Tomar el siguiente pendiente (userscript) |
| POST | `/api/queue/:id/result` `{ outcome, instagramUserId?, error? }` | Informar resultado (userscript) |
| POST | `/api/queue/:id/release` | Devolver a pendiente (rate limit o reintento manual) |
| POST | `/api/queue/:id/cancel` | Cancelar |
| POST | `/api/queue/retry-failed` | Reintentar todos los fallidos |
| DELETE | `/api/queue/finished` | Borrar historial terminado |

`from`/`to` aceptan `YYYY-MM-DD` (inicio y fin de día en hora local) o ISO completo.

## Scripts

```bash
npm run dev        # servidor con recarga
npm test           # vitest
npm run typecheck
npm run build && npm start
npm run seed -- 300
npm run import -- /ruta/exportacion
```

## Cómo habla el userscript con Instagram (oct 2026)

Instagram cambia sus endpoints internos sin aviso. Lo que funciona a fecha de octubre de 2026, verificado con una cuenta real:

- Cabecera `X-ASBD-ID: 359341`. Con el valor antiguo (`129477`) los endpoints de amistad responden con la página HTML en lugar de JSON.
- Los POST llevan en el cuerpo `fb_dtsg` y `jazoest`, tokens que el script lee de la propia página (`require('DTSGInitialData')` o el HTML).
- Usuario → id: `GET /api/v1/friendships/<tu_id>/followers/?query=<usuario>&search_surface=follow_list_page`. Como respaldo, el HTML del perfil.
- Borrar: `POST /api/v1/friendships/remove_follower/<id>/`, y después `GET /api/v1/friendships/show/<id>/` para confirmar que `followed_by` es `false`.
- `web_profile_info`, `topsearch` y `/api/v1/web/friendships/*` ya no existen (404).

Si vuelve a fallar con "respuesta no JSON", abre DevTools en instagram.com, elimina un seguidor a mano y copia los valores de las cabeceras de esa petición. El botón **Diagnóstico** del panel prueba cada endpoint y manda el resultado a la pestaña *Cola de eliminación* de la app. Receta tomada de [InstagramUnfollowers PR #372](https://github.com/davidarroyo1234/InstagramUnfollowers/pull/372).

## Aviso

Automatizar la eliminación de seguidores incumple las condiciones de uso de Instagram y puede provocar bloqueos temporales o retos de verificación. Los endpoints internos que usa el userscript (`web_profile_info`, `friendships/remove_follower`) pueden cambiar sin aviso. Usa pausas largas y pocos por hora. Úsalo bajo tu responsabilidad.
