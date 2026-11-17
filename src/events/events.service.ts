import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import * as crypto from 'node:crypto';

/** Oculta la contraseña de una URL amqp://usuario:clave@host para los logs. */
export function maskCredentials(url: string): string {
  return url.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:***@');
}

export interface StaffEventPayload {
  userId: string;
  staffId: string;
  firstName: string;
  lastName: string;
  roles: string[];
  isActive: boolean;
}

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private readonly exchange = 'restaurant.staff.events';

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const rabbitUrl = this.configService.get<string>(
      'RABBITMQ_URL',
      'amqp://localhost:5672',
    );
    try {
      this.connection = await amqp.connect(rabbitUrl);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
      // Si el broker se cae después, el estado se refleja en /health.
      this.connection.on?.('close', () => {
        this.channel = null;
        this.connection = null;
        this.reportFailure('Se perdió la conexión con RabbitMQ');
      });
      this.logger.log(`Conectado exitosamente a RabbitMQ en ${maskCredentials(rabbitUrl)}`);
    } catch (error) {
      this.channel = null;
      this.reportFailure(
        `No se pudo conectar a RabbitMQ en ${maskCredentials(rabbitUrl)} (${error.message})`,
      );
    }
  }

  /** true si hay un canal abierto con el broker (lo usa /health). */
  isConnected(): boolean {
    return this.channel !== null;
  }

  /**
   * En producción un broker caído es un error (antes solo era una advertencia y
   * los eventos se perdían sin que nadie lo notara, #11). En desarrollo se
   * permite trabajar sin RabbitMQ.
   */
  private reportFailure(message: string): void {
    const suffix = 'Los eventos de personal NO se están publicando.';
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      this.logger.error(`${message}. ${suffix}`);
    } else {
      this.logger.warn(`${message}. ${suffix} (modo desarrollo)`);
    }
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // Ignorar errores al cerrar
    }
  }

  private publish(routingKey: string, type: string, data: StaffEventPayload | { userId: string; staffId: string }) {
    const cloudEvent = {
      specversion: '1.0',
      type,
      source: 'urn:fmat:service:auth',
      id: `evt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data,
    };

    if (this.channel) {
      try {
        this.channel.publish(
          this.exchange,
          routingKey,
          Buffer.from(JSON.stringify(cloudEvent)),
          { persistent: true },
        );
        this.logger.log(`Evento publicado [${routingKey}]: ${cloudEvent.id}`);
      } catch (err) {
        this.logger.error(`Error publicando evento [${routingKey}]: ${err.message}`);
      }
    } else {
      this.logger.debug(
        `[RabbitMQ Mock] Evento omitido por ausencia de broker: [${routingKey}] ${JSON.stringify(cloudEvent)}`,
      );
    }
  }

  publishStaffCreated(data: StaffEventPayload): Promise<void> {
    this.publish('staff.created', 'urn:fmat:event:staff:member-created', data);
    return Promise.resolve();
  }

  publishStaffRolesUpdated(data: StaffEventPayload): Promise<void> {
    this.publish('staff.roles.updated', 'urn:fmat:event:staff:roles-updated', data);
    return Promise.resolve();
  }

  publishStaffStatusChanged(data: StaffEventPayload): Promise<void> {
    this.publish('staff.status.changed', 'urn:fmat:event:staff:status-changed', data);
    return Promise.resolve();
  }

  publishStaffDeleted(data: { userId: string; staffId: string }): Promise<void> {
    this.publish('staff.deleted', 'urn:fmat:event:staff:member-deleted', data);
    return Promise.resolve();
  }
}
