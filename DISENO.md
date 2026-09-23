# Gestión de Racks — documento de diseño

Borrador para discutir. Hermano de `Control-Secaderos`: misma fábrica, mismo
stack, y **las mismas convenciones**, porque las lecciones que costaron caro allá
valen igual acá (ver `ARQUITECTURA.md` de ese repo, §9 y §10).

Las decisiones marcadas **⟨pendiente⟩** necesitan una respuesta de planta antes
de escribir el esquema definitivo. Están puestas a propósito en el documento y no
en un chat: son las que no se pueden cambiar barato después.

---

## 1. Qué resuelve

La fábrica almacena producto terminado en **racks**. Lo que importa en el rack no
es la placa: es el **bulto** y su **packaging**, porque de eso dependen la
cantidad, el lugar que ocupa y el riesgo de transporte.

El sistema tiene que responder, en cualquier momento y sin bajar a mirar:

- Cuánto hay de cada modelo, abierto por packaging y en unidades base.
- Dónde está exactamente cada bulto (rack + posición).
- Quién lo movió, cuándo, y desde/hacia dónde.
- **Qué tan confiable es ese dato**, que es la pregunta que esta app agrega
  respecto de un inventario común.

Contexto de uso, que condiciona el diseño igual que en secaderos:

- El operario del autoelevador registra **desde el celular, arriba de la máquina**,
  al lado del rack. Cada movimiento real tiene que poder registrarse en pocos
  toques o no se registra.
- El operario de control recorre y chequea; su trabajo es la fuente de verdad del
  índice de confiabilidad.
- Comercial y administración miran stock desde la PC.

---

## 2. Stack

Igual a secaderos, con dos cambios y una advertencia.

| Pieza | Elección |
| --- | --- |
| Framework | Next.js 15 (App Router), Server Components + Server Actions |
| UI | React 19 + Tailwind v4 |
| ORM | Drizzle |
| Base | **PostgreSQL en Neon** |
| Hosting | Vercel |
| Auth | usuario + PIN numérico, bcrypt, cookie `jose` (portado tal cual) |

Cambios deliberados respecto de secaderos, tomados de su §10 ("qué haría
distinto"):

1. **Migraciones versionadas desde el día uno** (`drizzle-kit generate` +
   archivos), con un paso explícito de *backfill* al lado de cada una. En
   secaderos `push` dejó tres veces columnas nuevas con el valor equivocado en
   filas viejas.
2. **Endpoint de versión** (`/api/version` leyendo `VERCEL_GIT_COMMIT_SHA`), para
   saber si lo que estás mirando es el deploy nuevo o el viejo.

Advertencia de infraestructura, específica de Neon:

- El endpoint **pooled** de Neon es PgBouncer en **modo transacción**, que es
  exactamente el modo que reventó con `postgres-js` en Supabase por el
  *pipelining* (§9.1 de secaderos). Con `prepare: false` funciona, pero hay que
  **medirlo con `Promise.all` antes de confiar**, no después. Alternativa si falla:
  `drizzle-orm/neon-serverless` (WebSocket), que soporta transacciones reales —
  las necesitamos, por el `FOR UPDATE`.
- **`drizzle-kit` va contra el endpoint directo** (`DIRECT_URL`), no contra el pooled.
- Neon **suspende la base por inactividad**. El primer movimiento de la mañana
  paga el arranque (~½ segundo o más). Para una app de piso conviene desactivar
  el autosuspend o dejarlo asumido y dicho.

---

## 3. Modelo de dominio

### 3.1 Las tres piezas del vocabulario

**Línea** → **modelo** → **bulto**.

| Línea | Unidad base | Estado |
| --- | --- | --- |
| Placas | placa | activa |
| Piedras | paquete | activa |
| Pisos flotantes | caja | preparada, apagada |

La unidad base es **un dato de la línea, no un `if` en el código**. Es lo que
permite que pisos flotantes entre después sin tocar ninguna consulta: la cuarta
solapa dice "1.240 placas" o "1.240 paquetes" o "1.240 cajas" leyendo
`linea.unidad`. Este es el único mecanismo que necesita "dejar todo listo para
pisos flotantes": nada de código muerto esperando la línea tres.

### 3.2 Packaging: tres valores fijos, no una tabla editable

```
suelto      | producto sin paletizar arriba de un palet de madera. Cantidad libre.
palet       | altura estándar, segura en transporte. Cantidad normalizada.
optimizado  | más alto que el estándar; más producto por viaje, más riesgo de
            | desmoronamiento. Se ofrece al cliente a sabiendas. Cantidad normalizada.
```

Va como **enum en código**, no como tabla de ABM, y es una decisión consciente
contraria a la de secaderos con `tipos`. Allá el razonamiento fue: no atar la
lógica a un nombre editable (§4.3/§4.4). Acá es el mismo razonamiento con el
resultado inverso: los tres valores **tienen semántica propia en el código** —
`suelto` no tiene norma, `optimizado` puede no entrar en cualquier nivel — así
que dejarlos editables sería prometer una flexibilidad que el código no tiene.
Si mañana aparece un cuarto packaging, es un cambio de código, y está bien que lo sea.

### 3.3 Cantidades normalizadas

La cantidad de un palet **depende del modelo y del packaging**, no de la línea:
un optimizado de Laja no lleva las mismas placas que un optimizado de Patagónica,
y los cinco palets de Ekos llevan todos lo mismo. Eso es una tabla `normas`
`(modelo, packaging) → cantidad`, con dos reglas:

- **Sin fila = sin norma.** Es el `null` con significado propio de secaderos
  (§4.2b): el sistema no opina sobre la cantidad de un suelto, y **cero seguiría
  siendo inválido**.
- **La norma es el valor por defecto, no una validación.** El bulto guarda su
  **cantidad real**. Las excepciones existen y hay que poder registrarlas; lo que
  no puede pasar es que se registren sin darse cuenta: cargar un palet fuera de
  norma **pide confirmación con el número grande** y exige nota, igual que la
  carga incompleta en el carrusel.

Fuera de norma **se calcula, no se carga** (mismo criterio que el desvío del plan
en secaderos): es `cantidad ≠ norma_de_hoy`. Se compara contra la norma vigente y
no contra un snapshot, porque la pregunta que importa es comercial y es del
presente: *¿este palet es despachable como estándar hoy?*

### 3.4 Grupos, unidades y posiciones

Tres niveles, y son tres de verdad:

```
GRUPO     A, B, C…  un lugar físico donde todas las posiciones comparten
                    características. Eso es lo que lo hace un grupo.
UNIDAD    un MÓDULO en un selectivo, una CALLE en un penetrable.
POSICIÓN  el lugar de UN bulto, con dirección propia.
```

Puede haber **dos grupos con la misma geometría** —A y F, los dos selectivos de
2×3— porque el grupo es un lugar, no un tipo. Y la geometría se declara una vez
por grupo, no posición por posición:

| Tipo | Se escribe | Un ejemplo |
| --- | --- | --- |
| Selectivo | `ancho × niveles` | módulo de 2×3 = 6 posiciones |
| Penetrable | `niveles × profundidad` | calle de 3×2 = 6 posiciones |

De la geometría salen las posiciones, y su código:

```
D-06-3     selectivo: columna 6, nivel 3
B-07-2-1   penetrable: calle 7, nivel 2, profundidad 1 (pasillo)
```

En los selectivos las **columnas van corridas por grupo** —módulo 3, columna 2 de
un rack de 2 es la columna 6— porque para el que busca "06" es un solo número, y
"módulo 3 derecha" son dos datos y una convención más para recordar.

Los nombres de los niveles (piso, medio, arriba) y de las profundidades
(pasillo, centro, pared) **se derivan de cuántos hay**, no se cargan. Un nombre
que se escribe una vez por grupo es un nombre que un día va a estar mal escrito.

**Cada posición aloja un bulto.** Antes una calle penetrable era una posición que
aguantaba tres y la profundidad era un dato del bulto; ahora cada slot tiene
dirección, y el chequeo de control pasa de aproximado —"en C-3 hay tres
palets"— a exacto.

### 3.5 Lo que tapa a qué

En un penetrable el autoelevador **entra manejando por adentro de la calle**, y
de ahí salen dos bloqueos distintos:

1. **El mismo nivel, más cerca del pasillo.** Para llegar al del fondo hay que
   bajar el de adelante. Es el LIFO clásico del drive-in.
2. **El piso, hasta esa profundidad.** Un palet en el piso le corta el camino al
   clark: *no se puede sacar el del nivel medio si el del pasillo del piso está
   ocupado*.

El segundo es el que hace que un penetrable se vacíe de arriba hacia abajo y de
afuera hacia adentro. No es una restricción del sistema: es cómo funciona el
fierro, y si la app dejara registrar lo contrario, lo registrado dejaría de
coincidir con la realidad, que es lo que esta app existe para evitar.

En un selectivo no hay nada de esto: cada posición se alcanza sin mover nada.

### 3.6 La altura

Dos datos que se comparan:

- **Del lado del rack**: la altura libre de cada **nivel del grupo**. Va por
  nivel y no por posición porque todas las del nivel medio del grupo B tienen la
  misma luz, y cargar doscientas alturas a mano es inusable. Una posición puede
  sobrescribirla si tiene una viga cruzada.
- **Del lado del producto**: la altura de un `(modelo, packaging)`, que vive en
  `normas` junto a la cantidad. La norma **es** la especificación de un bulto
  normalizado: cuánto lleva y cuánto mide.

El **suelto no tiene altura**, igual que no tiene cantidad normalizada: no hay
dos sueltos iguales. Por eso no tiene fila en `normas` y por eso nunca se le
revisa la altura.

Si falta cualquiera de los dos datos —la norma sin medir, el nivel sin medir— **no
se valida nada**. Se puede usar la app antes de tener toda la planta medida, y
cada altura que se carga empieza a proteger sola.

### 3.7 Identidad del bulto ⟨pendiente — la más importante⟩

Todo el diseño del chequeo depende de esto: **¿el bulto tiene una identidad física
propia?** ¿Lleva etiqueta con número o QR, o lo único que lo identifica es "lo que
hay en B-4"?

- **Con etiqueta**: el chequeo es exacto (*"el palet P-01234 está en B-4"*), se
  puede seguir la vida de un bulto entero y el operario escanea en vez de tipear.
- **Sin etiqueta**: el chequeo solo puede validar el **contenido de la posición**
  (*"en B-4 hay 1 palet de Laja de 60 paquetes"*), que para el inventario alcanza.

El diseño de abajo funciona en los dos casos: el bulto tiene un `codigo` que
genera el sistema, y el flujo de chequeo es **por posición**. Si mañana ponen
etiquetas, el código ya existe y solo se agrega el escaneo. Pero conviene
decidirlo ahora, porque si hay etiquetas el flujo de "subir" empieza por escanear
y se acorta mucho.

### 3.8 Bultos mezclados

**Resuelto:** sí existen. Se arman poco —para completar un pedido— pero se
arman, y traen una consecuencia que ordena el modelo entero:

> **Un bulto mezclado nunca es normalizado.** La norma vive en
> (modelo, packaging): *"un palet de Laja lleva 48 paquetes"*. Un bulto con dos
> modelos no tiene contra qué compararse, porque no hay **un** modelo del cual
> sea el palet.

No es una limitación del sistema, es lo que la palabra significa. Por eso un
bulto mezclado va siempre como **`suelto`**, y `palet` y `optimizado` quedan
reservados para lo normalizado, que es lo que esas dos palabras quieren decir
para el que vende. Si un mezclado pudiera registrarse como palet, el stock de
"palets de Laja" incluiría bultos que nadie puede despachar como palet de Laja.

De acá sale la decisión estructural: **el modelo no es un campo del bulto, es
una tabla de contenido** (`bulto_contenido`), y el historial lleva sus líneas
(`movimiento_lineas`). Es el mismo par `secadero_contenido` / `movimiento_lineas`
de Control-Secaderos.

Y se guarda **siempre** con líneas, incluso el bulto de un solo modelo, que es
el caso normal. Tener dos representaciones —el modelo en la fila cuando es uno,
la tabla cuando son varios— obligaría a cada consulta a cubrir los dos casos, y
la que se olvide de uno miente en silencio.

**En las cuatro solapas**: los 20 paquetes de Laja que viajan en un bulto
mezclado se cuentan en la solapa de **sueltos** de Laja, marcados como
mezclados. No inventamos una quinta solapa para algo que pasa poco, y no los
escondemos: están en el rack y son stock.

---

## 4. Movimientos

Se aplica la **regla de oro** de secaderos (§3.2), que es la decisión más
importante del modelo:

> Si dos cosas se van a medir distinto, son dos tipos de movimiento distintos.

| Tipo | Qué es | Por qué separado |
| --- | --- | --- |
| `alta` | El bulto entra al sistema (se armó en planta) | Es producción ingresada, no un movimiento de rack |
| `subir` | piso → posición | El movimiento típico |
| `mover` | posición → posición | Manipulación interna. **No es stock nuevo ni menos** |
| `bajar` | posición → piso, sigue en planta | Bajado ≠ entregado. Un bulto al pie del rack existe |
| `entrega` | Sale de la fábrica | **El único que resta stock comercial** |
| `reempaque` | Cambia packaging o cantidad (armar / desarmar / pasar a optimizado) | Mueve cantidad entre solapas sin que entre ni salga nada de la fábrica |
| `ajuste` | Corrección de control, con motivo obligatorio | Es la medida del error del sistema. Mezclarlo con `mover` borraría el único número que dice cuánto nos equivocamos |

Si `bajar` y `entrega` fueran el mismo tipo con una nota, no se podría distinguir
"lo bajé para reacomodar el rack" de "salió a un cliente", que es la diferencia
entre manipulación y venta.

Corolario heredado: **toda consulta de estadística filtra por tipo
explícitamente**, así un tipo nuevo queda fuera de los cálculos viejos por
defecto, que es el comportamiento correcto.

### 4.1 Corrección

Se porta el mecanismo de secaderos tal cual (§3.3), que ya está probado:

> Cada uno puede corregir lo último que hizo con un bulto, mientras nadie lo haya
> tocado después, y en el mismo día. El admin no tiene las restricciones de autor
> ni de día.

Corregir es **anular y rehacer en una sola transacción**: el original no se borra
ni se edita (queda con `anulado_en`, `anulado_por`, `motivo_anulacion`), el bulto
se restaura a como estaba antes, y el reemplazo lleva **la hora y el autor del
original** con `reemplaza_a` apuntando al viejo. Así, para cualquier reporte, el
reemplazo es simplemente lo que esa persona hizo ese día.

Consecuencia que no se puede olvidar: **toda consulta que sume movimientos filtra
los anulados**. Si una consulta nueva se lo olvida, un movimiento corregido cuenta
dos veces.

### 4.2 Concurrencia

Toda operación corre **dentro de una transacción y empieza bloqueando**
(`SELECT ... FOR UPDATE`) el bulto y la posición destino. Es lo que evita que dos
autoelevadores con la pantalla abierta manden el mismo bulto a dos lados, o dos
bultos a la misma posición. El segundo espera y falla con un mensaje concreto:
*"B-4 ya está ocupada: Pedro subió un palet de Laja hace 2 minutos. Actualizá la
pantalla."*

---

## 5. Control y confiabilidad

Es la parte que esta app agrega respecto de un inventario común, y el corazón del
producto.

### 5.1 El chequeo no es un movimiento

Un chequeo **no cambia el mundo, lo observa**. Por la regla de oro va en su propia
tabla: se mide distinto que todo lo demás y su volumen es otro.

El operario de control recorre una posición y registra uno de tres resultados:

| Resultado | Qué significa |
| --- | --- |
| `ok` | Lo que dice el sistema es lo que hay |
| `vacio_ok` | El sistema dice vacío y está vacío. **Vale tanto como un `ok`**: confirmar un vacío es información |
| `corregido` | No coincidía. El operario **lo corrige y la corrección queda asentada** |

Un chequeo `corregido` escribe **dos cosas en la misma transacción**: la fila de
chequeo (para el índice) y un movimiento `ajuste` (para el inventario y la
auditoría). Nunca una sola: si solo quedara el ajuste, el índice no sabría que
alguien pasó; si solo quedara el chequeo, el stock quedaría mal.

**Todo chequeo registra su hora**, y es lo único que hace avanzar el reloj de la
confiabilidad.

### 5.2 Qué caduca un chequeo

Un chequeo dice *"en B-04-2-1 hay este bulto"*. Cualquier cosa que haga falsa esa
frase lo caduca:

| Qué pasa | Qué se borra |
| --- | --- |
| El bulto se mueve, o sale, o le sacan una parte | el `chequeado_en` **del bulto** |
| La posición cambia lo que tiene adentro | el `chequeado_en` **de la posición** |

Los **contadores** `ok`/`total` de la posición **no se borran nunca**: son su
historial, y una posición donde control viene encontrando diferencias lo sigue
siendo aunque cambie el palet que tiene adentro. Caduca el *cuándo*, no el
*cómo le fue*.

Sin la segunda fila, una posición que acababa de recibir un palet seguía
diciendo "chequeada hace 2 días" con adentro algo que nadie verificó ahí, y la
recorrida la despriorizaba: justo la que más convenía ir a mirar.

Y como "nunca se miró" y "se miró, pero después se movió" son dos cosas
distintas que las dos dan `null`, la pantalla las dice distinto. Decirle "nunca
chequeada" a una posición con historial sería mentirle al que decide adónde ir.

### 5.3 Un movimiento no es un chequeo

Decisión importante y discutible, así que la argumento: cuando el autoelevador
mueve un bulto, *ve* la posición — pero es también **quien puede haberse
equivocado**. Su registro es la afirmación que el control viene a verificar; usarla
para subir la confiabilidad sería dejar que el dato se valide a sí mismo.

Guardamos las dos fechas por separado y significan cosas distintas:

- `visto_en` → último movimiento. Útil en pantalla ("se tocó hoy").
- `chequeado_en` → último chequeo de control. **Es el que alimenta el índice.**

### 5.4 El índice

Un bulto chequeado ayer es más confiable que uno chequeado hace dos meses. Además,
una posición donde el control **siempre encuentra errores** es menos confiable que
otra que siempre dio bien, aunque las dos se hayan chequeado el mismo día. El
índice tiene las dos mitades:

```
frescura  = 0                             si nunca se chequeó
          = 0.5 ^ (días desde el chequeo / semivida)      semivida = 30 días, configurable

acierto   = (chequeos_ok + 1) / (chequeos_total + 2)      Laplace: un solo chequeo
                                                          no da ni 0 ni 1

confianza = frescura × acierto
```

Con semivida 30: chequeado ayer ≈ 0.98, hace un mes 0.50, hace dos meses 0.25.
Nunca chequeado es **0 y se muestra aparte**, no promediado como si fuera malo:
es una pregunta sin hacer, no una respuesta mala. (Mismo criterio que `sinNorma`
en la adherencia de secaderos: meter lo no evaluable al denominador hunde el
indicador con datos correctos, y sacarlo en silencio hace leer el porcentaje como
si cubriera todo.)

Se agrega en los cuatro niveles que pediste — **global, por línea, por modelo y
por posición** — promediando por bulto, con variante ponderada por cantidad (un
palet de 60 paquetes mal cargado duele más que uno de 4).

**⟨pendiente 5⟩** ¿Te cierra la semivida de 30 días, o el ritmo real de recorrida
es otro? Es un parámetro de `config`, pero define los colores que ve todo el mundo.

### 5.5 El índice es una cola de trabajo, no un adorno

El uso más valioso del índice no es el número: es **ordenar la recorrida del
control**. La pantalla de control abre con las posiciones ordenadas por
`(1 − confianza) × cantidad`: primero lo que hace más que no se mira y más
producto tiene. Eso convierte el indicador en el plan del día.

---

## 6. Vistas

### 6.1 Por modelo: cuatro solapas (la pantalla central)

`/modelos/[id]` — las cuatro solapas que pediste:

| Solapa | Muestra |
| --- | --- |
| Sueltos | Los bultos sin paletizar, con su cantidad y ubicación |
| Palet | Los palets estándar |
| Optimizado | Los optimizados |
| Total | La suma en unidad base de la línea (placas / paquetes / cajas) |

En las tres primeras: cantidad de bultos, unidades, ubicaciones, marca de fuera de
norma y **color de confiabilidad**. La cuarta es la que se cita por teléfono
cuando comercial pregunta cuánto hay.

Heredado de secaderos: **el contador es una puerta**. Todo número se toca y abre
la lista de los bultos que lo componen, con su posición.

### 6.2 Las demás

- **Mover** (autoelevador): subir / bajar / mover / entregar, en pocos toques, con
  la actividad del día propia y el acceso a corregir lo último.
- **Control**: recorrida ordenada por confiabilidad, chequeo en un toque cuando
  está bien, corrección asentada cuando no.
- **Tablero de racks**: la foto de la planta, rack por rack, con ocupación y
  confiabilidad. Es el mapa, y muestra los huecos.
- **Stock**: por línea y modelo, con las cuatro vistas de packaging.
- **Movimientos**: historial filtrable + export.
- **Confiabilidad**: el índice abierto por línea, modelo y posición, y el ranking
  de posiciones más olvidadas.
- **Admin**: ABM de líneas, modelos, normas, racks, posiciones y usuarios.

### 6.3 Roles ⟨pendiente 6⟩

Propuesta, a confirmar contra los puestos reales:

| Rol | Qué hace |
| --- | --- |
| `admin` | Todo |
| `autoelevador` | Subir, bajar, mover, entregar. Corrige lo último propio |
| `control` | Chequea y corrige, con la corrección asentada |
| `comercial` | Ve stock y ubicaciones. No opera |
| `auditor` | Ve todo, no modifica nada |

Igual que en secaderos: **lo que se separa es la navegación, no el permiso de
mover un bulto**, y **cada server action revalida por su cuenta** con `autorizar()`,
porque el middleware no es una frontera suficiente. Una excepción real: el
`ajuste` de control sí es exclusivo de `control` y `admin`, porque es la medida
del error y quien lo comete no lo puede borrar.

---

## 7. Esquema propuesto

```
usuarios          usuario, nombre, pin_hash, rol, activo,
                  intentos_fallidos, bloqueado_hasta

lineas            codigo, nombre, unidad_singular, unidad_plural, activa, orden
modelos           linea_id, nombre, codigo, activo, orden
normas            modelo_id, packaging, cantidad          -- sin fila = sin norma

racks             codigo, nombre, accesibilidad, activo, orden
posiciones        rack_id, codigo, ⟨nivel⟩, ⟨profundidad⟩, capacidad, activa,
                  chequeado_en, chequeos_ok, chequeos_total

bultos            codigo, modelo_id, packaging, cantidad,
                  posicion_id, ⟨profundidad⟩, estado,
                  creado_en, creado_por, visto_en, chequeado_en

movimientos       bulto_id + snapshots (bulto_codigo, modelo_nombre, linea_codigo,
                                        packaging, cantidad),
                  tipo, posicion_desde_id + codigo, posicion_hasta_id + codigo,
                  usuario_id + usuario_nombre, motivo_id + motivo_nombre, nota,
                  creado_en, anulado_en, anulado_por, motivo_anulacion,
                  reemplaza_a, chequeo_id

chequeos          posicion_id + posicion_codigo, bulto_id, resultado,
                  usuario_id + usuario_nombre, nota, creado_en

motivos           nombre, ambito (ajuste | entrega | reempaque), activo
config            clave (PK), valor
```

Convenciones heredadas, que atraviesan todo (§4.2 de secaderos):

- **Snapshots de nombres en el historial.** `movimientos` y `chequeos` guardan el
  nombre del modelo, del usuario y el código de la posición, además de las FK. El
  historial se sigue leyendo aunque después se renombre un modelo o se dé de baja
  un rack.
- **`null` con significado propio**, distinto de cero: sin norma, sin tope de
  altura, nunca chequeado. El campo vacío del formulario produce `null`; nunca
  `Number("")`, que da `0` y significa otra cosa.
- **Nada se borra.** Modelos, racks y posiciones se suspenden. Los errores se
  arreglan con corrección o con `ajuste`, y quedan registrados.
- **Los contadores de chequeo se mantienen al escribir**, no se recalculan al
  leer, por el mismo motivo que `duracion_min` en secaderos: que la pantalla no
  reconstruya la historia posición por posición.

`estado` del bulto: `en_rack` (tiene posición), `en_piso` (existe, sin posición),
`entregado`, `desarmado` (se reempacó en otro). Solo los dos primeros son stock.

---

## 8. Por dónde arrancar

| Fase | Qué |
| --- | --- |
| 0 | Repo, Next 15 + Tailwind 4 + Drizzle, base en Neon, auth por PIN, roles, middleware, `Resultado`/`ejecutar`/`useAccion`, `/api/version`. **Prueba de concurrencia contra Neon antes de seguir** |
| 1 | Esquema + migración + seed: líneas, modelos, normas, racks y posiciones reales. ABM de admin |
| 2 | Movimientos: subir, bajar, mover, entregar, con bloqueo y corrección |
| 3 | La vista por modelo con las cuatro solapas, el tablero de racks y el stock |
| 4 | Control: chequeos, `ajuste` asentado, índice de confiabilidad y recorrida ordenada |
| 5 | Pisos flotantes: se enciende la línea y se cargan modelos y normas. **Sin tocar código** |

### Decisiones que se tomaron sin esperar respuesta

El esquema de la fase 1 se escribió antes de tener contestados los ⟨pendiente⟩,
resolviéndolos con **columnas nullable**, que es el mismo `null` con significado
propio de §3.3: *el sistema no opina*.

- `posiciones.nivel`, `posiciones.profundidad` y `posiciones.altura_max_cm` nacen
  en `null`. Si la planta usa niveles o carriles con fondo, se llenan; si no, no
  se muestran. Ninguna de las tres identifica la posición: `codigo` es único
  dentro del rack y es el que se dice por handy.
- `bultos.etiqueta` es nullable, para el número o QR pegado al bulto si algún día
  se usa. El `codigo` que genera el sistema funciona con etiquetas y sin ellas.
- Un bulto es de **un solo modelo**. Si aparecen bultos mezclados para armar un
  pedido, es una tabla de líneas por bulto: hay que planificarlo, no improvisarlo.

Contestar los pendientes ahora es barato —llenar columnas que ya existen—, y por
eso se avanzó en vez de esperar. Lo que sigue siendo caro es el último punto.

### Etapa de prueba

Cargar datos inventados, mirarlos, borrarlos y volver a empezar es parte del
diseño y no un andamio: un borrado masivo agregado al final es el que se lleva
puestos los datos reales.

Vive en `config.modo_prueba`, en la base y no en una variable de entorno, porque
"esto es una instalación de prueba" es un hecho de **esta base** y tiene que
viajar con ella: una variable de entorno se la lleva puesta el día que alguien
clone el proyecto para otra planta.

Tres candados sobre el borrado, y ninguno sobra: solo `admin` revalidado contra
la base, solo con el modo encendido, y hay que escribir la palabra exacta —un
"¿estás seguro?" con botón Aceptar se contesta que sí sin leerlo—.

La fase 0 termina con la app desplegada en Vercel, logueando, contra Neon. La
fase 1 necesita los datos de planta: los racks con su accesibilidad, las
posiciones y la tabla de modelo × packaging → cantidad.

---

## 9. Lo que copiamos de secaderos sin discutir

Está probado en producción y en el piso de esa planta:

- Un tipo de movimiento por cada cosa que se mida distinto.
- `null` con semántica explícita y documentada.
- Snapshots de nombres en el historial.
- Bloqueo `FOR UPDATE` + mensaje de conflicto en castellano operativo.
- `Resultado<T>` uniforme, `ErrorDeNegocio` para lo esperable.
- Reintentos **solo** para fallos de red, nunca para un rechazo de negocio, y el
  mensaje explícito *"el movimiento NO se guardó"* cuando se agotan.
- Import de dos pasos, que nunca borra y es todo-o-nada.
- Confirmación con el número grande solo en el caso raro; el caso típico no
  pregunta, porque una confirmación en cada movimiento se toca sin leer.
- Comentarios largos explicando **por qué**, no qué.
