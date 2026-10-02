import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

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

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const rabbitUrl = this.configService.get<string>(
      'RABBITMQ_URL',
      'amqp://localhost:5672',
    );
    try {
      this.connection = await amqp.connect(rabbitUrl);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
      this.logger.log(`Conectado exitosamente a RabbitMQ en ${rabbitUrl}`);
    } catch (error) {
      this.logger.warn(
        `No se pudo conectar a RabbitMQ (${error.message}). Los eventos se omitirán localmente.`,
      );
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

  private async publish(routingKey: string, type: string, data: StaffEventPayload) {
    const cloudEvent = {
      specversion: '1.0',
      type,
      source: 'urn:fmat:service:auth',
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
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

  async publishStaffCreated(data: StaffEventPayload) {
    return this.publish('staff.created', 'urn:fmat:event:staff:member-created', data);
  }

  async publishStaffRolesUpdated(data: StaffEventPayload) {
    return this.publish('staff.roles.updated', 'urn:fmat:event:staff:roles-updated', data);
  }

  async publishStaffStatusChanged(data: StaffEventPayload) {
    return this.publish('staff.status.changed', 'urn:fmat:event:staff:status-changed', data);
  }
}
