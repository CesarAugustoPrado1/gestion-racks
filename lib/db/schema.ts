import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
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
