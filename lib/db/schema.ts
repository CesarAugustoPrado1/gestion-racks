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

/** Solo `en_rack` y `en_piso` son stock: los otros dos ya no existen como bulto. */
export const estadoBultoEnum = pgEnum("estado_bulto", [
  "en_rack",
  "en_piso",
  "entregado",
  "desarmado",
]);

/**
 * Un tipo por cada cosa que se mida distinto. Es la regla de oro heredada de
 * Control-Secaderos y la decision mas importante del modelo.
 *
 * `alta`      el bulto entra al sistema: se armo en planta. Es produccion
 *             ingresada, no un movimiento de rack.
 * `subir`     piso -> posicion.
 * `mover`     posicion -> posicion. Manipulacion interna: no es stock nuevo ni
 *             menos.
 * `bajar`     posicion -> piso, sigue en planta. Bajado NO es entregado: un
 *             bulto al pie del rack existe y se cuenta.
 * `entrega`   sale de la fabrica. El UNICO que resta stock comercial.
 * `reempaque` cambia el packaging o la cantidad (armar, desarmar, pasar a
 *             optimizado). Mueve cantidad entre solapas sin que entre ni salga
 *             nada de la fabrica.
 * `ajuste`    correccion de control, con motivo obligatorio. Es la medida del
 *             error del sistema; mezclarlo con `mover` borraria el unico numero
 *             que dice cuanto nos equivocamos.
 *
 * Si `bajar` y `entrega` fueran el mismo tipo con una nota, no se podria
 * distinguir "lo baje para reacomodar" de "salio a un cliente", que es la
 * diferencia entre manipulacion y venta.
 *
 * Corolario: toda consulta de estadistica filtra por tipo EXPLICITAMENTE, asi un
 * tipo nuevo queda fuera de los calculos viejos por defecto.
 */
export const tipoMovimientoEnum = pgEnum("tipo_movimiento", [
  "alta",
  "subir",
  "bajar",
  "mover",
  "entrega",
  "reempaque",
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

export const ambitoMotivoEnum = pgEnum("ambito_motivo", [
  "ajuste",
  "entrega",
  "reempaque",
]);

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
  },
  (t) => [uniqueIndex("normas_modelo_packaging").on(t.modeloId, t.packaging)],
);

/* -------------------------------------------------------------------------- */
/* Ubicaciones                                                                */
/* -------------------------------------------------------------------------- */

export const racks = pgTable("racks", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre"),
  accesibilidad: accesibilidadEnum("accesibilidad").notNull(),
  activo: boolean("activo").notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/**
 * Una posicion dentro de un rack. Se muestra siempre como codigo compuesto y
 * hablado -"B-4"-, que es el que el operario dice por handy.
 *
 * Tres columnas nacen nullable a proposito, porque todavia no sabemos como esta
 * organizada la planta y `null` significa "el sistema no opina":
 *
 * - `nivel`: si las posiciones tienen altura propia (B-4-2). Si en la planta
 *   alcanza con rack + posicion, queda en null y no se muestra.
 * - `profundidad`: cuantos bultos de fondo entran en un carril penetrable. En un
 *   rack selectivo no significa nada.
 * - `alturaMaxCm`: para avisar que un optimizado no entra. Si no hay ninguna
 *   posicion con ese limite, queda en null: un campo que nadie usa miente.
 *
 * `codigo` es el codigo completo DENTRO del rack ("4", o "4-2" si hay niveles),
 * y es unico por rack. `nivel` sirve para agrupar y filtrar, no para
 * identificar: si identificara, no podria ser nullable.
 *
 * Los contadores de chequeo se mantienen al escribir y no se recalculan al leer,
 * por el mismo motivo que `duracion_min` en Control-Secaderos: que la pantalla no
 * reconstruya la historia posicion por posicion.
 */
export const posiciones = pgTable(
  "posiciones",
  {
    id: serial("id").primaryKey(),
    rackId: integer("rack_id")
      .notNull()
      .references(() => racks.id),
    codigo: text("codigo").notNull(),
    nivel: integer("nivel"),
    profundidad: integer("profundidad"),
    capacidadBultos: integer("capacidad_bultos").notNull().default(1),
    alturaMaxCm: integer("altura_max_cm"),
    activa: boolean("activa").notNull().default(true),
    orden: integer("orden").notNull().default(0),
    chequeadoEn: timestamp("chequeado_en", { withTimezone: true }),
    chequeosOk: integer("chequeos_ok").notNull().default(0),
    chequeosTotal: integer("chequeos_total").notNull().default(0),
  },
  (t) => [uniqueIndex("posiciones_rack_codigo").on(t.rackId, t.codigo)],
);

/* -------------------------------------------------------------------------- */
/* Bultos                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * La unidad que se almacena: un palet, un optimizado, o producto suelto arriba
 * de un palet de madera.
 *
 * Un bulto es de UN SOLO modelo. Es como funciona la norma comercial; si algun
 * dia hay bultos mezclados para armar un pedido, es una tabla de lineas por
 * bulto y hay que planificarlo, no improvisarlo.
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
 */
export const bultos = pgTable(
  "bultos",
  {
    id: serial("id").primaryKey(),
    codigo: text("codigo").notNull().unique(),
    etiqueta: text("etiqueta"),
    modeloId: integer("modelo_id")
      .notNull()
      .references(() => modelos.id),
    packaging: packagingEnum("packaging").notNull(),
    cantidad: integer("cantidad").notNull(),
    estado: estadoBultoEnum("estado").notNull().default("en_piso"),
    posicionId: integer("posicion_id").references(() => posiciones.id),
    profundidad: integer("profundidad"),
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
    index("bultos_modelo_packaging").on(t.modeloId, t.packaging, t.estado),
  ],
);

/* -------------------------------------------------------------------------- */
/* Movimientos y chequeos                                                     */
/* -------------------------------------------------------------------------- */

export const motivos = pgTable("motivos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  ambito: ambitoMotivoEnum("ambito").notNull(),
  activo: boolean("activo").notNull().default(true),
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
    modeloId: integer("modelo_id")
      .notNull()
      .references(() => modelos.id),
    modeloNombre: text("modelo_nombre").notNull(),
    lineaCodigo: text("linea_codigo").notNull(),
    packaging: packagingEnum("packaging").notNull(),
    cantidad: integer("cantidad").notNull(),
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

export type Linea = typeof lineas.$inferSelect;
export type Modelo = typeof modelos.$inferSelect;
export type Rack = typeof racks.$inferSelect;
export type Posicion = typeof posiciones.$inferSelect;
export type Bulto = typeof bultos.$inferSelect;
export type Movimiento = typeof movimientos.$inferSelect;
export type Chequeo = typeof chequeos.$inferSelect;
