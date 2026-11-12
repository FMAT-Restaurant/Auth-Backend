/**
 * Validación de variables de entorno al arrancar.
 *
 * El secreto JWT no tiene valor por defecto: si falta, es muy corto o es uno de
 * los valores de ejemplo que estuvieron publicados en el repositorio, el servicio
 * no arranca. Así nunca se firma un token con un secreto que cualquiera conoce.
 */

export const JWT_SECRET_MIN_LENGTH = 32;

/** Secretos que aparecieron en el repositorio y por tanto son públicos. */
const KNOWN_PUBLIC_SECRETS = new Set([
  'fmat-restaurant-auth-secret-key-2026',
  'super_secret_jwt_key_restaurant_auth_2026!',
  'secret_jwt_access_fmat_restaurant_2026',
  'secret_jwt_refresh_fmat_restaurant_2026',
]);

export function assertValidJwtSecret(secret: unknown): string {
  if (typeof secret !== 'string' || secret.trim() === '') {
    throw new Error(
      'Falta la variable JWT_SECRET. Genera una con: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET debe tener al menos ${JWT_SECRET_MIN_LENGTH} caracteres.`,
    );
  }
  if (KNOWN_PUBLIC_SECRETS.has(secret)) {
    throw new Error(
      'JWT_SECRET usa un valor de ejemplo que es público. Genera uno nuevo.',
    );
  }
  return secret;
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  assertValidJwtSecret(config.JWT_SECRET);
  return config;
}
