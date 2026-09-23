import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Los puestos de esta app.
 *
 * `autoelevador` es el que mueve: sube, baja, mueve y entrega. Es el rol que
 *   trabaja desde el celular arriba de la maquina, y el unico que registra la
 *   realidad a medida que la cambia.
 * `control` chequea que lo registrado coincida con lo que hay, y corrige
 *   dejando asentada la correccion. Su trabajo es lo que alimenta el indice de
 *   confiabilidad, asi que el `ajuste` es exclusivo suyo (y del admin): si
 *   quien se equivoca puede borrar el error, el indice deja de medir algo.
 * `comercial` consulta stock y ubicaciones. No opera.
 * `auditor` ve todo y no escribe nada, en ninguna pantalla.
 *
 * Igual que en Control-Secaderos, lo que se separa por rol es la NAVEGACION,
 * no el permiso de mover un bulto: en el piso el que estaba a mano hace el
 * movimiento, y lo que importa es que quede atribuido a quien lo hizo.
 */
export const rolEnum = pgEnum("rol", [
  "admin",
  "autoelevador",
  "control",
  "comercial",
  "auditor",
]);

export type Rol = (typeof rolEnum.enumValues)[number];

/* -------------------------------------------------------------------------- */
/* Tablas                                                                     */
/* -------------------------------------------------------------------------- */

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  usuario: text("usuario").notNull().unique(),
  nombre: text("nombre").notNull(),
  pinHash: text("pin_hash").notNull(),
  rol: rolEnum("rol").notNull(),
  activo: boolean("activo").notNull().default(true),
  /**
   * Freno de fuerza bruta: un PIN de 4 digitos son 10.000 combinaciones y sin
   * tope se prueban enteras en minutos. A los 5 intentos fallidos se bloquea
   * por 5 minutos (ver lib/acciones/sesion.ts).
   */
  intentosFallidos: integer("intentos_fallidos").notNull().default(0),
  bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Parametros que se cambian sin desplegar. Clave -> valor como texto, porque
 * los tipos los conoce quien lee la clave y no la tabla.
 *
 * Por ahora vive aca `confiabilidad_semivida_dias`, que define a que ritmo
 * envejece un chequeo. Ver DISENO.md §5.3.
 */
export const config = pgTable("config", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
});

export type Usuario = typeof usuarios.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Dominio: líneas, modelos y packaging                                       */
/* -------------------------------------------------------------------------- */

/**
 * Los tres packagings, como enum de codigo y no como tabla de ABM.
 *
 * Es una decision consciente contraria a la de `tipos` en Control-Secaderos.
 * Alla el razonamiento fue no atar la logica a un nombre editable; aca es el
 * mismo razonamiento con el resultado inverso: estos tres valores TIENEN
 * semantica propia en el codigo -`suelto` no lleva norma, `optimizado` puede no
 * entrar en cualquier nivel- asi que dejarlos editables seria prometer una
 * flexibilidad que el codigo no tiene.
 *
 * Si algun dia aparece un cuarto packaging es un cambio de codigo, y esta bien
 * que lo sea.
 */
export const packagingEnum = pgEnum("packaging", [
  "suelto",
  "palet",
  "optimizado",
]);
export type Packaging = (typeof packagingEnum.enumValues)[number];

/**
 * Como se alcanza una posicion, y por lo tanto cuanto cuesta tocar lo que hay
 * adentro.
 *
 * `selectivo`: cada posicion se alcanza sin mover nada.
 * `penetrable` (drive-in): la posicion es un carril con profundidad, y sacar el
 *   del fondo obliga a bajar los de adelante. Es LIFO en la practica.
 */
export const accesibilidadEnum = pgEnum("accesibilidad", [
  "selectivo",
  "penetrable",
]);

/**
 * Tres estados, y solo los dos primeros son stock.
 *
 * `sin_ubicar` es el limbo: el bulto ESTA en el sistema y se cuenta, pero
 * todavia no tiene lugar asignado. Pasa cuando las posiciones previstas para ese
 * producto estan llenas -o cuando hay lugar pero esta reservado para otra cosa-
 * y el palet no se puede quedar sin existir solo porque no hay donde ponerlo.
 *
 * Tiene un costo deliberado: un bulto sin ubicar NO SE PUEDE CHEQUEAR, porque no
 * hay posicion que verificar. Su confiabilidad queda en "sin datos" mientras
 * siga ahi. El limbo tiene que ser incomodo, si no se llena.
 *
 * `salido` no dice por que salio: eso vive en el motivo del movimiento, que es
 * donde se puede medir.
 */
export const estadoBultoEnum = pgEnum("estado_bulto", [
  "ubicado",
  "sin_ubicar",
  "salido",
]);
export type EstadoBulto = (typeof estadoBultoEnum.enumValues)[number];

/**
 * CUATRO movimientos, definidos por su efecto sobre el stock.
 *
 * Esta es la segunda version del modelo y la buena. La primera tenia siete tipos
 * definidos por la INTENCION (alta, subir, bajar, mover, entrega, reempaque,
 * ajuste). Estos cuatro se definen por lo que le hacen al stock, que es lo unico
 * que el operario, el comercial y el dueño tienen que entender igual:
 *
 *   meter   +   entra producto al rack
 *   sacar   -   sale producto del rack, entero o una parte
 *   mover   0   cambia de lugar; sigue estando y sigue disponible
 *   ajuste  ±   el registro estaba mal y control lo corrige: NO SE MOVIO NADA
 *
 * Las palabras son las de la planta, no las del programador. Si el sistema y el
 * piso no hablan igual, la traduccion la termina haciendo el operario, y ahi se
 * equivoca.
 *
 * `ajuste` es el que no se puede fusionar con ninguno. Si una correccion de
 * control se registrara como `meter`, el sistema diria que produccion entrego
 * palets que nunca existieron, y se perderia el unico numero que dice cuanto nos
 * equivocamos, que es lo que le da sentido al indice de confiabilidad.
 *
 * Lo que `sacar` NO distingue por tipo -venta, rearmado, rotura- va en el
 * motivo, que es obligatorio y de lista cerrada. Ver `motivos`.
 */
export const tipoMovimientoEnum = pgEnum("tipo_movimiento", [
  "meter",
  "sacar",
  "mover",
  "ajuste",
]);
export type TipoMovimiento = (typeof tipoMovimientoEnum.enumValues)[number];

/**
 * `vacio_ok` vale tanto como un `ok`: confirmar que una posicion esta vacia es
 * informacion, no ausencia de informacion.
 */
export const resultadoChequeoEnum = pgEnum("resultado_chequeo", [
  "ok",
  "vacio_ok",
  "corregido",
]);
export type ResultadoChequeo = (typeof resultadoChequeoEnum.enumValues)[number];

export const ambitoMotivoEnum = pgEnum("ambito_motivo", ["salida", "ajuste"]);

/**
 * La unidad base es un dato de la LINEA, no un `if` en el codigo.
 *
 * Es lo unico que hace falta para que pisos flotantes entre despues sin tocar
 * ninguna consulta: la cuarta solapa dice "1.240 placas", "1.240 paquetes" o
 * "1.240 cajas" leyendo de aca. Nada de codigo muerto esperando la linea tres.
 */
export const lineas = pgTable("lineas", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  unidadSingular: text("unidad_singular").notNull(),
  unidadPlural: text("unidad_plural").notNull(),
  activa: boolean("activa").notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

export const modelos = pgTable(
  "modelos",
  {
    id: serial("id").primaryKey(),
    lineaId: integer("linea_id")
      .notNull()
      .references(() => lineas.id),
    nombre: text("nombre").notNull(),
    activo: boolean("activo").notNull().default(true),
    orden: integer("orden").notNull().default(0),
  },
  (t) => [uniqueIndex("modelos_linea_nombre").on(t.lineaId, t.nombre)],
);

/**
 * Cantidad normalizada por (modelo, packaging).
 *
 * Depende del modelo y no de la linea: un optimizado de Laja no lleva los mismos
 * paquetes que un optimizado de Patagonica, y los cinco palets de Ekos llevan
 * todos lo mismo.
 *
 * SIN FILA = SIN NORMA, que es el `null` con significado propio de
 * Control-Secaderos: el sistema no opina sobre la cantidad de un suelto. Cero
 * seguiria siendo invalido.
 *
 * Y es un valor POR DEFECTO, no una validacion: el bulto guarda su cantidad
 * real. Las excepciones existen y hay que poder registrarlas; lo que no puede
 * pasar es que se registren sin darse cuenta.
 */
export const normas = pgTable(
  "normas",
  {
    id: serial("id").primaryKey(),
    modeloId: integer("modelo_id")
      .notNull()
      .references(() => modelos.id),
    packaging: packagingEnum("packaging").notNull(),
    cantidad: integer("cantidad").notNull(),
    /**
     * Cuánto mide un bulto de este modelo en este packaging, en centímetros.
     *
     * Es lo que se compara contra la altura libre del nivel al meter o mover.
     * `null` = sin medir, y entonces no se valida.
     *
     * El SUELTO nunca tiene altura, igual que nunca tiene cantidad normalizada:
     * no hay dos sueltos iguales. Por eso las dos cosas viven en la misma tabla
     * -la especificación de un (modelo, packaging) normalizado- y por eso un
     * suelto no tiene fila acá.
     */
    alturaCm: integer("altura_cm"),
  },
  (t) => [uniqueIndex("normas_modelo_packaging").on(t.modeloId, t.packaging)],
);

/* -------------------------------------------------------------------------- */
/* Ubicaciones                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Un GRUPO de racks: A, B, C… Un lugar físico donde todas las posiciones
 * comparten características. Eso es lo que lo hace un grupo.
 *
 * Puede haber dos grupos con la misma geometría -A y F, los dos selectivos de
 * 2×3- porque el grupo es un LUGAR, no un tipo.
 *
 * La geometría se guarda acá y las posiciones se generan de ella:
 *
 *   selectivo    ancho × niveles        un módulo de 2×3 son 6 posiciones
 *   penetrable   niveles × profundidad  una calle de 3×2 son 6 posiciones
 *
 * `unidades` son los módulos (selectivo) o las calles (penetrable). Las
 * columnas nulas son las que no aplican al tipo: un selectivo no tiene
 * profundidad y un penetrable no tiene ancho, y `null` dice eso mejor que un 1
 * que se podría confundir con un dato.
 */
export const grupos = pgTable("grupos", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre"),
  accesibilidad: accesibilidadEnum("accesibilidad").notNull(),
  ancho: integer("ancho"),
  niveles: integer("niveles").notNull().default(3),
  profundidad: integer("profundidad"),
  unidades: integer("unidades").notNull().default(0),
  activo: boolean("activo").notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/**
 * La altura libre de cada nivel del grupo.
 *
 * Va por nivel y no por posición porque todas las posiciones del nivel medio
 * del grupo B tienen la misma luz, y cargar doscientas alturas a mano es
 * inusable. Una posición puede sobrescribirla si tiene una viga cruzada.
 *
 * `null` = sin medir, y entonces **no se valida nada**: se puede usar la app
 * antes de tener toda la planta medida, y cada altura que se carga empieza a
 * proteger sola.
 *
 * El nombre del nivel -piso, medio, arriba- NO se guarda: se deriva de cuántos
 * hay, en lib/posiciones.ts. Un nombre que se escribe una vez por grupo es un
 * nombre que un día va a estar mal escrito.
 */
export const nivelesDeGrupo = pgTable(
  "niveles",
  {
    id: serial("id").primaryKey(),
    grupoId: integer("grupo_id")
      .notNull()
      .references(() => grupos.id, { onDelete: "cascade" }),
    nivel: integer("nivel").notNull(),
    alturaMaxCm: integer("altura_max_cm"),
  },
  (t) => [uniqueIndex("niveles_grupo_nivel").on(t.grupoId, t.nivel)],
);

/**
 * Una posición: el lugar de UN bulto, con dirección propia.
 *
 *   D-06-3     selectivo: columna 6, nivel 3
 *   B-07-2-1   penetrable: calle 7, nivel 2, profundidad 1 (pasillo)
 *
 * Antes una calle penetrable era UNA posición que aguantaba tres bultos y la
 * profundidad era un dato del bulto. Ahora cada slot es una posición: el chequeo
 * de control pasa de aproximado -"en C-3 hay tres palets"- a exacto -"en la
 * calle 7, nivel medio, contra la pared hay un palet de Laja"-.
 *
 * `codigo` es el código dentro del grupo y se genera de las coordenadas; las
 * coordenadas quedan guardadas aparte porque son con lo que se calcula qué tapa
 * a qué, y parsear un string para eso sería pedir un bug.
 *
 * Los contadores de chequeo se mantienen al escribir y no se recalculan al leer,
 * por el mismo motivo que `duracion_min` en Control-Secaderos: que la pantalla no
 * reconstruya la historia posición por posición.
 *
 * `chequeadoEn` de la posición se BORRA cuando un movimiento cambia lo que
 * tiene adentro: el chequeo decía "acá hay este bulto" y eso dejó de ser cierto.
 * Los contadores `chequeosOk`/`chequeosTotal` en cambio NO se borran: son el
 * historial de la posición, y una donde control viene encontrando diferencias lo
 * sigue siendo aunque cambie el palet. Caduca el "cuándo", no el "cómo le fue".
 */
export const posiciones = pgTable(
  "posiciones",
  {
    id: serial("id").primaryKey(),
    grupoId: integer("grupo_id")
      .notNull()
      .references(() => grupos.id),
    codigo: text("codigo").notNull(),
    /** Módulo (selectivo) o calle (penetrable). */
    unidad: integer("unidad").notNull().default(1),
    /** Columna corrida dentro del grupo. Solo selectivo. */
    columna: integer("columna"),
    nivel: integer("nivel").notNull().default(1),
    /** 1 es el del pasillo, el más alto el de la pared. Solo penetrable. */
    profundidad: integer("profundidad"),
    /** Sobrescribe la altura del nivel. `null` = usa la del nivel. */
    alturaMaxCm: integer("altura_max_cm"),
    /**
     * El bulto de ABAJO que se comio este hueco por alto.
     *
     * Un optimizado que mide mas que su nivel entra igual en la practica, pero
     * sobresale e inutiliza la posicion de arriba. La app lo permite -porque en
     * el galpon pasa- y a cambio marca las dos: esta queda ocupada por un bulto
     * que no esta parado aca, sino justo debajo.
     *
     * POR QUE ACA Y NO UNA BANDERA EN EL BULTO. Se guarda del lado de la victima
     * porque es del lado de la victima donde se pregunta: toda consulta de
     * "¿esta libre?" mira esta fila, y con la bandera del otro lado cada una de
     * esas consultas tendria que hacer un self-join de posiciones para buscar la
     * de abajo. Una columna, una fuente de verdad, y "que bultos invaden" sigue
     * siendo una busqueda por este indice.
     *
     * La escribe y la limpia `aplicarMovimiento`, en la misma transaccion que
     * mueve el bulto, que es el unico escritor de movimientos. Si el bulto se
     * va o baja, esto vuelve a `null` solo.
     */
    bloqueadaPorBultoId: integer("bloqueada_por_bulto_id").references(
      (): AnyPgColumn => bultos.id,
    ),
    activa: boolean("activa").notNull().default(true),
    orden: integer("orden").notNull().default(0),
    chequeadoEn: timestamp("chequeado_en", { withTimezone: true }),
    chequeosOk: integer("chequeos_ok").notNull().default(0),
    chequeosTotal: integer("chequeos_total").notNull().default(0),
  },
  (t) => [
    uniqueIndex("posiciones_grupo_codigo").on(t.grupoId, t.codigo),
    index("posiciones_grupo_unidad").on(t.grupoId, t.unidad, t.nivel),
    index("posiciones_bloqueada_por").on(t.bloqueadaPorBultoId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Bultos                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * La unidad que se almacena: un palet, un optimizado, o producto suelto arriba
 * de un palet de madera.
 *
 * El modelo NO es un campo de esta tabla: esta en `bultoContenido`, porque un
 * bulto puede llevar mas de uno. Pasa poco -se arma para completar un pedido-
 * pero pasa, y un bulto mezclado NUNCA es normalizado: no encaja ni en palet
 * standard ni en optimizado, porque la norma es por (modelo, packaging) y aca
 * no hay un solo modelo del cual hablar. Ver `bultoContenido`.
 *
 * Se guarda con una linea de contenido incluso cuando el bulto es de un solo
 * modelo, que es el caso normal. Tener dos representaciones -el modelo en la
 * fila cuando es uno, la tabla cuando son varios- obligaria a cada consulta a
 * cubrir los dos casos, y la que se olvide de uno miente en silencio.
 *
 * `codigo` lo genera el sistema (B-00042) y sirve aunque no haya etiquetas
 * fisicas. `etiqueta` es para el numero o QR pegado al bulto, si algun dia se
 * usa: con etiqueta el chequeo es exacto, sin ella valida el contenido de la
 * posicion, y las dos cosas funcionan con este esquema.
 *
 * `vistoEn` y `chequeadoEn` son DOS FECHAS DISTINTAS y no se pueden mezclar:
 * - `vistoEn` es el ultimo movimiento. Util en pantalla ("se tocó hoy").
 * - `chequeadoEn` es el ultimo chequeo de CONTROL, y es el unico que alimenta el
 *   indice de confiabilidad. El operario que mueve ve la posicion, pero es
 *   tambien quien pudo haberse equivocado: usar su registro para subir la
 *   confiabilidad seria dejar que el dato se valide a si mismo.
 *
 * Regla que las ata, y que hay que respetar en todo movimiento:
 *
 *   **`chequeadoEn` es el ultimo chequeo que verifico este bulto EN LA POSICION
 *   DONDE ESTA AHORA, y se borra -vuelve a `null`- cuando el bulto se mueve.**
 *
 * Un chequeo dice "en B-4 hay este bulto". Si despues el bulto se va a C-2, ese
 * chequeo ya no vouchea nada: nadie verifico que este en C-2. Dejar la fecha
 * puesta haria que un bulto recien movido se viera verde, que es exactamente al
 * reves de la verdad -acaba de pasar por las manos donde se cometen los errores
 * que el control busca-.
 */
export const bultos = pgTable(
  "bultos",
  {
    id: serial("id").primaryKey(),
    codigo: text("codigo").notNull().unique(),
    etiqueta: text("etiqueta"),
    packaging: packagingEnum("packaging").notNull(),
    /**
     * Total del bulto, en la unidad de la linea. Es la SUMA de las lineas de
     * contenido, guardada aca porque toda pantalla la muestra y ninguna quiere
     * sumar para mostrarla. Quien escribe contenido escribe este numero en la
     * misma transaccion.
     */
    cantidad: integer("cantidad").notNull(),
    /**
     * Sin default: cada alta tiene que decir explicitamente si el bulto entra
     * ubicado o al limbo. Un default aca haria que un olvido mande bultos a
     * `sin_ubicar` en silencio, que es justo el estado que no queremos que
     * crezca solo.
     */
    estado: estadoBultoEnum("estado").notNull(),
    posicionId: integer("posicion_id").references(() => posiciones.id),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    creadoPor: integer("creado_por").references(() => usuarios.id),
    vistoEn: timestamp("visto_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    chequeadoEn: timestamp("chequeado_en", { withTimezone: true }),
    chequeosOk: integer("chequeos_ok").notNull().default(0),
    chequeosTotal: integer("chequeos_total").notNull().default(0),
  },
  (t) => [
    index("bultos_posicion").on(t.posicionId),
    index("bultos_packaging").on(t.packaging, t.estado),
  ],
);

/**
 * Que hay adentro de un bulto. Es un SNAPSHOT VIVO, no un historial: se
 * reemplaza entero en cada movimiento que cambie el contenido.
 *
 * Una fila cuando el bulto es de un modelo -el caso normal- y varias cuando es
 * mezclado.
 *
 * **Mezclado implica sin norma.** La norma vive en (modelo, packaging), asi que
 * un bulto con dos modelos no tiene contra que compararse: por eso un bulto
 * mezclado va siempre como `suelto`, y `palet` y `optimizado` quedan
 * reservados para lo normalizado, que es lo que esas dos palabras significan
 * para el que vende. La regla se valida en `lib/bultos.ts`.
 *
 * Consecuencia en las cuatro solapas del modelo: los paquetes de Laja que viajan
 * en un bulto mezclado se cuentan en la solapa de sueltos de Laja, marcados como
 * mezclados. No inventamos una quinta solapa para algo que pasa poco, y no los
 * escondemos: estan en el rack y son stock.
 */
export const bultoContenido = pgTable(
  "bulto_contenido",
  {
    id: serial("id").primaryKey(),
    bultoId: integer("bulto_id")
      .notNull()
      .references(() => bultos.id, { onDelete: "cascade" }),
    modeloId: integer("modelo_id")
      .notNull()
      .references(() => modelos.id),
    cantidad: integer("cantidad").notNull(),
  },
  (t) => [
    uniqueIndex("bulto_contenido_bulto_modelo").on(t.bultoId, t.modeloId),
    index("bulto_contenido_modelo").on(t.modeloId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Movimientos y chequeos                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Por que salio, o por que hubo que ajustar.
 *
 * Es LISTA CERRADA y no texto libre, por una razon simple: el texto libre no se
 * puede sumar. "Cuanto salio a clientes este mes" tiene que ser una consulta, no
 * una lectura de notas.
 *
 * Y el motivo de una salida se pide EN EL MOMENTO porque es el unico momento en
 * que se sabe: el lunes nadie puede reconstruir por que bajaron el P-00042 el
 * jueves. Es un toque mas para el operario y es irrecuperable si no se pide.
 */
export const motivos = pgTable("motivos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  ambito: ambitoMotivoEnum("ambito").notNull(),
  /**
   * Si esta salida es producto que se fue de la fabrica. Un rearmado tambien
   * resta del rack, pero no es una venta: sin esta bandera, "lo que salio" y "lo
   * que se vendio" serian el mismo numero y no lo son.
   */
  esEgreso: boolean("es_egreso").notNull().default(true),
  activo: boolean("activo").notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/**
 * El historial. Guarda SNAPSHOTS de los nombres ademas de las FK: el modelo se
 * puede renombrar y el rack se puede dar de baja, y el historial tiene que
 * seguir leyendose igual.
 *
 * Corregir es anular y rehacer en una transaccion: el original no se borra ni se
 * edita -queda con `anuladoEn`, `anuladoPor` y `motivoAnulacion`- y el reemplazo
 * lleva la hora y el autor del original, con `reemplazaA` apuntando al viejo.
 * Asi, para cualquier reporte, el reemplazo es sencillamente lo que esa persona
 * hizo ese dia.
 *
 * CONSECUENCIA QUE NO SE PUEDE OLVIDAR: toda consulta que sume movimientos filtra
 * los anulados. Si una consulta nueva se lo olvida, un movimiento corregido
 * cuenta dos veces.
 */
export const movimientos = pgTable(
  "movimientos",
  {
    id: serial("id").primaryKey(),
    bultoId: integer("bulto_id")
      .notNull()
      .references(() => bultos.id),
    bultoCodigo: text("bulto_codigo").notNull(),
    lineaCodigo: text("linea_codigo").notNull(),
    /**
     * ANTES y DESPUES, en todos los movimientos y sin excepcion. Es la
     * convencion que sostiene todo el sistema y hay que respetarla:
     *
     *   meter          antes 0   despues 48   -> +48
     *   sacar entero   antes 48  despues 0    -> -48
     *   sacar parcial  antes 48  despues 43   -> -5
     *   mover          antes 48  despues 48   -> 0
     *   ajuste         antes 48  despues 44   -> -4
     *
     * Con esto el efecto sobre el stock es siempre `cantidad - cantidadAntes`,
     * sin un solo caso especial y sin que ninguna consulta tenga que saber que
     * significa cada tipo. Sumar esa resta sobre los movimientos VIGENTES da el
     * stock, y esa es la unica cuenta que no se puede equivocar.
     *
     * El packaging va igual, porque cambia solo: sacar una parte de un palet lo
     * convierte en suelto, y el historial tiene que mostrar donde paso eso.
     */
    cantidadAntes: integer("cantidad_antes").notNull(),
    cantidad: integer("cantidad").notNull(),
    packagingAntes: packagingEnum("packaging_antes"),
    packaging: packagingEnum("packaging").notNull(),
    tipo: tipoMovimientoEnum("tipo").notNull(),
    posicionDesdeId: integer("posicion_desde_id").references(
      () => posiciones.id,
    ),
    posicionDesdeCodigo: text("posicion_desde_codigo"),
    posicionHastaId: integer("posicion_hasta_id").references(
      () => posiciones.id,
    ),
    posicionHastaCodigo: text("posicion_hasta_codigo"),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    usuarioNombre: text("usuario_nombre").notNull(),
    motivoId: integer("motivo_id").references(() => motivos.id),
    motivoNombre: text("motivo_nombre"),
    nota: text("nota"),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    anuladoPor: integer("anulado_por").references(() => usuarios.id),
    motivoAnulacion: text("motivo_anulacion"),
    reemplazaA: integer("reemplaza_a").references(
      (): AnyPgColumn => movimientos.id,
    ),
  },
  (t) => [
    index("movimientos_bulto").on(t.bultoId, t.id),
    index("movimientos_fecha").on(t.creadoEn),
  ],
);

/**
 * Un chequeo no cambia el mundo: lo OBSERVA. Por eso es tabla propia y no un
 * tipo de movimiento -se mide distinto y su volumen es otro-.
 *
 * Un chequeo `corregido` escribe dos cosas en la misma transaccion: esta fila
 * (para el indice) y un movimiento `ajuste` (para el inventario y la auditoria).
 * Nunca una sola: si solo quedara el ajuste, el indice no sabria que alguien
 * paso; si solo quedara el chequeo, el stock quedaria mal.
 */
export const chequeos = pgTable(
  "chequeos",
  {
    id: serial("id").primaryKey(),
    posicionId: integer("posicion_id")
      .notNull()
      .references(() => posiciones.id),
    posicionCodigo: text("posicion_codigo").notNull(),
    bultoId: integer("bulto_id").references(() => bultos.id),
    resultado: resultadoChequeoEnum("resultado").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    usuarioNombre: text("usuario_nombre").notNull(),
    nota: text("nota"),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("chequeos_posicion").on(t.posicionId, t.creadoEn)],
);

/**
 * El contenido del bulto en el momento del movimiento, modelo por modelo, con
 * la misma convencion de antes y despues que la cabecera.
 *
 * `cantidad - cantidadAntes` es el efecto de ESTE movimiento sobre ESE modelo.
 * Sumado sobre los movimientos vigentes da el stock por modelo, que es el numero
 * de las cuatro solapas.
 *
 * Guarda `modeloNombre` ademas de la FK, como todo el historial: el modelo se
 * puede renombrar y lo que se movio ese dia no cambia.
 */
export const movimientoLineas = pgTable(
  "movimiento_lineas",
  {
    id: serial("id").primaryKey(),
    movimientoId: integer("movimiento_id")
      .notNull()
      .references(() => movimientos.id, { onDelete: "cascade" }),
    modeloId: integer("modelo_id")
      .notNull()
      .references(() => modelos.id),
    modeloNombre: text("modelo_nombre").notNull(),
    cantidadAntes: integer("cantidad_antes").notNull().default(0),
    cantidad: integer("cantidad").notNull(),
  },
  (t) => [index("movimiento_lineas_movimiento").on(t.movimientoId)],
);

export type Linea = typeof lineas.$inferSelect;
export type Modelo = typeof modelos.$inferSelect;
export type Grupo = typeof grupos.$inferSelect;
export type Posicion = typeof posiciones.$inferSelect;
export type Bulto = typeof bultos.$inferSelect;
export type Movimiento = typeof movimientos.$inferSelect;
export type Chequeo = typeof chequeos.$inferSelect;
