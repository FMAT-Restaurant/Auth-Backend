import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial del microservicio de Auth.
 *
 * Las bases que ya existían se crearon con `synchronize`, así que si la tabla
 * `users` ya está, esta migración no hace nada y solo queda registrada como
 * aplicada. En una base vacía crea todas las tablas.
 */
export class InitialSchema1762900000000 implements MigrationInterface {
  name = 'InitialSchema1762900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('users')) {
      return;
    }

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "roles" ("code" character varying(50) NOT NULL, "name" character varying(100) NOT NULL, "description" text, "isAssignable" boolean NOT NULL DEFAULT true, "permissions" text, "isSystemRole" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_f6d54f95c31b73fb1bdd8e91d0c" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "staff_profiles" ("userId" uuid NOT NULL, "staffId" character varying(10) NOT NULL, "firstName" character varying(100) NOT NULL, "lastName" character varying(100) NOT NULL, "phone" character varying(30), "hiredAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_1f1747cfc8e3b6e33dff9a2bd55" UNIQUE ("staffId"), CONSTRAINT "PK_538ab8c582b6c827244952a2923" PRIMARY KEY ("userId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "tokenHash" character varying(255) NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "isRevoked" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c25bc63d248ca90e8dcc1d92d06" UNIQUE ("tokenHash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userType" character varying(20) NOT NULL DEFAULT 'STAFF', "email" character varying(150), "passwordHash" character varying(255) NOT NULL, "passwordStatus" character varying(20) NOT NULL DEFAULT 'ACTIVE', "isActive" boolean NOT NULL DEFAULT true, "passwordResetRequested" boolean NOT NULL DEFAULT false, "tokenVersion" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "action" character varying(100) NOT NULL, "ipAddress" character varying(50), "userAgent" text, "details" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_roles" ("userId" uuid NOT NULL, "roleCode" character varying(50) NOT NULL, CONSTRAINT "PK_bac1f7a2eeea06f08496b4b7d44" PRIMARY KEY ("userId", "roleCode"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_472b25323af01488f1f66a06b6" ON "user_roles" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_71a039b8deec247b3c47b48a01" ON "user_roles" ("roleCode") `,
    );
    await queryRunner.query(
      `ALTER TABLE "staff_profiles" ADD CONSTRAINT "FK_538ab8c582b6c827244952a2923" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_472b25323af01488f1f66a06b67" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_71a039b8deec247b3c47b48a01b" FOREIGN KEY ("roleCode") REFERENCES "roles"("code") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
  }
}
