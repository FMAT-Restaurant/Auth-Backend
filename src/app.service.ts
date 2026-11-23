import { Injectable } from '@nestjs/common';
import { BrokerStatus, EventsService } from './events/events.service';

export interface HealthStatus {
  status: 'healthy' | 'degraded';
  timestamp: string;
  /** Segundos desde que arrancó el proceso (REQ-AUTH-022, #37). */
  uptime: number;
  dependencies: { rabbitmq: BrokerStatus };
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
   * RabbitMQ es opcional. Si está configurado pero no conecta, el servicio sigue
   * respondiendo y se reporta "degraded" para que se note que los eventos no se
   * publican (#11). Si no está configurado ("disabled"), no afecta el estado.
   */
  getHealth(): HealthStatus {
    const rabbitmq = this.eventsService.getStatus();
    return {
      status: rabbitmq === 'disconnected' ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      dependencies: { rabbitmq },
    };
  }
}
