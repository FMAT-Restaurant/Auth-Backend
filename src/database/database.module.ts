import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import {
  Restaurant,
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
          return {
            type: 'postgres',
            url: databaseUrl,
            entities: [
              Restaurant,
              User,
              StaffProfile,
              Role,
              RefreshToken,
              AuditLog,
            ],
            synchronize: true, // auto-sync schema for development
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
            Restaurant,
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
