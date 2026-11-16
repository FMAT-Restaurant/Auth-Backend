import { Controller, Get } from '@nestjs/common';
import { AppService, HealthStatus } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): { status: string; service: string; version: string } {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
