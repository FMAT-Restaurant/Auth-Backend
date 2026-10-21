import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import {
  User,
  StaffProfile,
  Role,
  RefreshToken,
  AuditLog,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');

        if (databaseUrl) {
          const requiresSsl =
            databaseUrl.includes('sslmode=require') ||
            databaseUrl.includes('neon.tech');

          return {
            type: 'postgres',
            url: databaseUrl,
            entities: [
              User,
              StaffProfile,
              Role,
              RefreshToken,
              AuditLog,
            ],
            synchronize: true, // auto-sync schema for development
            ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
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
          entities: [
            User,
            StaffProfile,
            Role,
            RefreshToken,
            AuditLog,
          ],
          synchronize: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
