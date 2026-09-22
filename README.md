# Gestión de Racks

Inventario de producto terminado en los racks de la fábrica: qué hay, en qué
packaging, en qué posición, quién lo movió y **qué tan confiable es ese dato**.

Hermana de [Control-Secaderos](https://github.com/CesarAugustoPrado1/Control-Secaderos):
mismo stack y mismas convenciones. El diseño del dominio y las razones de cada
decisión están en **[DISENO.md](DISENO.md)**, que es el documento a leer antes de
tocar el código.

## Estado

**Fase 0 hecha**: la app se levanta, loguea por usuario + PIN, manda a cada rol a
su pantalla y expone `/api/version`. Las pantallas de trabajo están en blanco a
propósito, cada una diciendo en qué fase se construye.

Pendiente antes de seguir con la fase 1:

- [ ] Aplicar `drizzle/0000_inicial.sql` y crear el usuario admin. Con terminal,
      `npm run db:migrate` y `npm run db:seed`; sin terminal, pegando el SQL en
      el editor de Neon (ver más abajo).
- [ ] Mirar el **diagnóstico de base**: `npm run probar-base` desde una terminal,
      o la pantalla `/admin/diagnostico` una vez desplegado. Es la validación de
      concurrencia contra el pooler de Neon, y es la que decide si seguimos con
      `postgres-js` o pasamos a `neon-serverless`. Ver el comentario largo en
      `lib/db/index.ts`.
- [ ] Contestar las decisiones marcadas ⟨pendiente⟩ en DISENO.md, que son las
      que definen el esquema de la fase 1.

## Stack

Next.js 15 (App Router, Server Components + Server Actions) · React 19 ·
Tailwind v4 · Drizzle ORM · PostgreSQL en Neon · Vercel.

La versión de Next sigue a Control-Secaderos a propósito: se comparte código
entre las dos apps y dos majores distintos multiplican el trabajo de portar.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # y completar DATABASE_URL, DIRECT_URL, SESSION_SECRET
npm run db:migrate             # aplica drizzle/*.sql (usa DIRECT_URL)
npm run db:seed                # crea el usuario admin con el PIN de ADMIN_PIN
npm run probar-base            # verifica el pooler antes de confiar en él
npm run dev
```

Con `npm run db:seed -- --con-ejemplos` se crean además un usuario por puesto
(`auto1`, `control1`, `comercial1`) con el mismo PIN, para probar cada pantalla.

### Arranque sin terminal

Todo lo de arriba se puede hacer sin instalar nada:

1. **La migración**: en el dashboard de Neon, *SQL Editor*, pegar el contenido de
   `drizzle/0000_inicial.sql` y ejecutar.
2. **El usuario admin**: un `insert` en `usuarios` con un hash de bcrypt del PIN.
   El hash no se puede escribir a mano; lo genera el seed, o se pide ya hecho.
3. **El deploy**: importar el repo en Vercel y cargar las variables.
4. **La verificación**: entrar a `/admin/diagnostico`, que corre las mismas tres
   mediciones que `npm run probar-base` pero **desde la instancia de Vercel**,
   que es donde de verdad importa cómo se porta el pooler.

La pantalla de diagnóstico queda para siempre, no es un andamio: el día que desde
la planta digan que la app está lenta, separa "la base tarda" de "la red del
galpón anda mal".

### Las dos URLs de Neon

| Variable | Endpoint | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | pooled (host con `-pooler`) | La app. Muchas instancias de Vercel, una conexión cada una |
| `DIRECT_URL` | directo (mismo host sin `-pooler`) | `drizzle-kit`: migraciones y studio |

**Borrá `channel_binding=require` de la URL que te da Neon.** `postgres-js`
manda todo parámetro que no reconoce en el paquete de arranque, y Postgres
rechaza la conexión con `unrecognized configuration parameter "channel_binding"`
—la app entera caída, con un mensaje que no menciona ni a Neon ni a la URL—.
`lib/db/index.ts` lo saca solo, porque esa URL se copia a mano en un panel donde
nadie va a leer esto, pero conviene no ponerlo.

El pooler de Neon es PgBouncer en **modo transacción**, que es el modo que en
Control-Secaderos colgaba las consultas concurrentes con `postgres-js`. Acá el
cliente va con `prepare: false` y por eso funciona; `npm run probar-base` lo
comprueba en vez de asumirlo.

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | `tsc --noEmit`. Lo único que ataja un error antes del deploy |
| `npm run lint` | ESLint |
| `npm run db:generate` | Genera el SQL de la migración desde el esquema |
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:studio` | Explorador de datos |
| `npm run db:seed` | Datos iniciales. Es idempotente y **no pisa lo existente** |
| `npm run probar-base` | Mide latencia, consultas en paralelo y `FOR UPDATE` |

**Migraciones versionadas, no `db:push`.** El script `db:push` existe para
prototipar rápido, pero lo que se despliega son los archivos de `drizzle/`. En
Control-Secaderos, usar solo `push` dejó tres veces columnas nuevas con el valor
equivocado en las filas que ya estaban.

> Después de toda migración, preguntarse explícitamente:
> **¿qué filas ya existentes quedan con el valor equivocado?**
> Si la respuesta no es "ninguna", el backfill es un paso aparte, y va al lado de
> la migración.

**Orden de despliegue** para cambios aditivos (columna nueva nullable, valor
nuevo de enum, tabla nueva): primero la base, después el código. Al revés hay una
ventana en la que el código nuevo consulta algo que todavía no existe.

## Despliegue en Vercel

Región `gru1` (São Paulo), fijada en `vercel.json`: la base está en
`sa-east-1`, y cruzar el hemisferio en cada consulta se nota.

Variables a cargar en Settings → Environment Variables, marcando Production:
`DATABASE_URL`, `SESSION_SECRET` y `DIRECT_URL`. Las variables nuevas **no se
aplican al deploy que ya estaba hecho**: hay que volver a desplegar.

Para saber qué commit está arriba: `curl https://<la-app>/api/version`. Pedir una
pantalla hasta que dé 200 no distingue el deploy nuevo del viejo, porque el viejo
también contesta 200.

## Mapa del código

```
app/
  (app)/          pantallas con sesión
    mover/        autoelevador: subir, bajar, mover, entregar     (fase 2)
    control/      chequeos y ajustes asentados                    (fase 4)
    racks/        la foto de la planta                            (fase 3)
    stock/        por modelo, con las cuatro solapas de packaging  (fase 3)
    admin/        ABM de líneas, modelos, normas, racks, usuarios  (fase 1)
  login/
  api/version/    qué commit está desplegado
lib/
  db/schema.ts    tablas y enums
  db/index.ts     cliente postgres cacheado (leer los comentarios)
  acciones/       server actions. comun.ts tiene Resultado/ejecutar/fallar
  auth.ts         requerirSesion (páginas) y autorizar (actions)
  session.ts      firma y verificación de la cookie
  permisos.ts     rol → rutas y navegación
components/       UI compartida
scripts/          seed y prueba de base
middleware.ts     navegación: público, login, redirección por rol
```

**Seguridad en dos capas, y las dos hacen falta.** `middleware.ts` controla la
navegación; cada server action revalida por su cuenta con `autorizar()`, porque
una action se puede invocar directamente y el middleware no la ve.
