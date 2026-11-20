/**
 * Factor de trabajo de bcrypt. >= 12 según ERS-GAP-05 (#32): a mayor costo,
 * más caro es un ataque de fuerza bruta contra los hashes de contraseña.
 */
export const BCRYPT_COST = 12;

/**
 * Audiencia (claim `aud`) de los JWT que emite el servicio de auth (ERS-GAP-07,
 * #36). Identifica para quién es válido el token dentro del sistema FMAT.
 * NOTA: confirmar el valor exacto contra la ERS / la config del API Gateway.
 */
export const JWT_AUDIENCE = 'urn:fmat:restaurant';
