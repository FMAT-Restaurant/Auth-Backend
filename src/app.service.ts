import { Injectable } from '@nestjs/common';
import { EventsService } from './events/events.service';

export interface HealthStatus {
  status: 'healthy' | 'degraded';
  timestamp: string;
  dependencies: { rabbitmq: 'connected' | 'disconnected' };
}

@Injectable()
export class AppService {
  constructor(private readonly eventsService: EventsService) {}

  getHello(): { status: string; service: string; version: string } {
    return {
      status: 'UP',
      service: 'fmat-auth-backend',
      version: '1.0.0',
    };
  }

  /**
   * El servicio sigue respondiendo sin RabbitMQ, pero se reporta como
   * "degraded" para que se note que los eventos no se están publicando (#11).
   */
  getHealth(): HealthStatus {
    const rabbitmq = this.eventsService.isConnected() ? 'connected' : 'disconnected';
    return {
      status: rabbitmq === 'connected' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: { rabbitmq },
    };
  }
}
