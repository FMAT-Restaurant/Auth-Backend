import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cambios de seguridad sobre bases creadas antes de las migraciones:
 * - #15: columna `tokenVersion` para invalidar access tokens.
 * - #14: se borra `temporaryPassword`, que guardaba contraseñas en texto plano.
 * Es idempotente: en una base nueva (creada por InitialSchema) no cambia nada.
 */
export class SessionVersionAndHashedTempPasswords1762900000001 implements MigrationInterface {
  name = 'SessionVersionAndHashedTempPasswords1762900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "temporaryPassword"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No se vuelve a crear `temporaryPassword`: las contraseñas en claro no deben regresar.
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "tokenVersion"`);
  }
}
