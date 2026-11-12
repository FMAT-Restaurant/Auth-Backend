import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { StaffModule } from './staff/staff.module';
import { RolesModule } from './roles/roles.module';
import { EventsModule } from './events/events.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './common/config/env.validation';
import { buildAuthThrottlers } from './common/security/rate-limit.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    // Límite de intentos para los endpoints públicos de autenticación
    // (se aplica solo donde se usa ThrottlerGuard, ver AuthController).
    // Por IP y por cuenta (ver rate-limit.config.ts).
    ThrottlerModule.forRoot(buildAuthThrottlers()),
    DatabaseModule,
    AuthModule,
    StaffModule,
    RolesModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
