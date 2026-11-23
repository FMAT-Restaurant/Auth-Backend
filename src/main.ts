import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { applySecurity } from './common/security/security.config';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { requestContextMiddleware } from './common/audit/request-context';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Contexto por petición (IP, user-agent, actor) para la auditoría (#33).
  app.use(requestContextMiddleware);
  applySecurity(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new DatabaseExceptionFilter());
  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Auth Backend running on http://localhost:${port}`);
}
void bootstrap();
