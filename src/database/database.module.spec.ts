import { schemaOptions, sslOptions } from './database.module';

describe('[SEC #20 / #22] Configuración de la base de datos', () => {
  it('en producción no sincroniza el esquema y aplica migraciones', () => {
    const opts = schemaOptions('production');
    expect(opts.synchronize).toBe(false);
    expect(opts.migrationsRun).toBe(true);
    expect(opts.migrations.length).toBeGreaterThan(0);
  });

  it('en desarrollo sincroniza el esquema y no corre migraciones', () => {
    for (const env of ['development', 'test', undefined]) {
      const opts = schemaOptions(env);
      expect(opts.synchronize).toBe(true);
      expect(opts.migrationsRun).toBe(false);
    }
  });

  it('con Neon verifica el certificado TLS del servidor', () => {
    expect(sslOptions('postgresql://u:p@ep-x.neon.tech/db?sslmode=require')).toEqual({
      ssl: { rejectUnauthorized: true },
    });
  });

  it('en una base local no usa TLS', () => {
    expect(sslOptions('postgresql://postgres:postgres@auth-db:5432/fmat_auth')).toEqual({});
  });
});
