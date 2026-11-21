import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { User, StaffProfile, Role, RefreshToken, AuditLog } from './entities';
import { MIGRATIONS } from './migrations';

const ENTITIES = [User, StaffProfile, Role, RefreshToken, AuditLog];

/**
 * Cómo se mantiene el esquema de la base (#20):
 * - Desarrollo: `synchronize` ajusta las tablas a las entidades automáticamente.
 * - Producción: nunca se sincroniza (puede borrar columnas y datos); se aplican
 *   las migraciones de `src/database/migrations` al arrancar.
 */
export function schemaOptions(nodeEnv: string | undefined) {
  const isProduction = nodeEnv === 'production';
  return {
    synchronize: !isProduction,
    migrations: MIGRATIONS,
    migrationsRun: isProduction,
  };
}

/**
 * Conexión TLS para bases administradas (Neon). Se verifica el certificado del
 * servidor con las CA del sistema; antes se aceptaba cualquiera (#22).
 */
export function sslOptions(databaseUrl: string) {
  const requiresSsl = databaseUrl.includes('sslmode=require') || databaseUrl.includes('neon.tech');
  return requiresSsl ? { ssl: { rejectUnauthorized: true } } : {};
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        const schema = schemaOptions(config.get<string>('NODE_ENV'));

        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            entities: ENTITIES,
            ...schema,
            ...sslOptions(databaseUrl),
            retryAttempts: 10,
            retryDelay: 3000,
            extra: {
              // Neon cierra conexiones inactivas y suspende el compute (scale-to-zero).
              // Estas opciones evitan reutilizar sockets muertos y toleran el arranque en frío.
              max: 10,
              keepAlive: true,
              keepAliveInitialDelayMillis: 10000,
              idleTimeoutMillis: 30000,
              connectionTimeoutMillis: 15000,
            },
          };
        }

        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST', 'localhost'),
          port: config.get<number>('DB_PORT', 5432),
          username: config.get<string>('DB_USER', 'postgres'),
          password: config.get<string>('DB_PASSWORD', 'postgres'),
          database: config.get<string>('DB_NAME', 'fmat_auth'),
          entities: ENTITIES,
          ...schema,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
