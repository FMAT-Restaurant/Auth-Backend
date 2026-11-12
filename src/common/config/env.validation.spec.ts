import { assertValidJwtSecret, validateEnv } from './env.validation';

describe('[SEC #9] Validación del secreto JWT', () => {
  it('no arranca si falta JWT_SECRET', () => {
    expect(() => validateEnv({})).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ JWT_SECRET: '   ' })).toThrow(/JWT_SECRET/);
  });

  it('rechaza secretos cortos', () => {
    expect(() => assertValidJwtSecret('corto')).toThrow(/32/);
  });

  it.each([
    'fmat-restaurant-auth-secret-key-2026',
    'super_secret_jwt_key_restaurant_auth_2026!',
    'secret_jwt_access_fmat_restaurant_2026',
    'secret_jwt_refresh_fmat_restaurant_2026',
  ])('rechaza el valor de ejemplo publicado %p', (secret) => {
    expect(() => assertValidJwtSecret(secret)).toThrow();
  });

  it('acepta un secreto aleatorio de 64 caracteres', () => {
    const secret = 'a3f1'.repeat(16);
    expect(assertValidJwtSecret(secret)).toBe(secret);
    expect(validateEnv({ JWT_SECRET: secret, PORT: '4000' })).toEqual({
      JWT_SECRET: secret,
      PORT: '4000',
    });
  });
});
