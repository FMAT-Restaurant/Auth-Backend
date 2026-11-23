import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsService } from './events/events.service';

describe('AppController', () => {
  let appController: AppController;
  let eventsService: { getStatus: jest.Mock };

  beforeEach(async () => {
    eventsService = { getStatus: jest.fn().mockReturnValue('connected') };
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: EventsService, useValue: eventsService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return service info', () => {
      const response = appController.getHello();
      expect(response).toHaveProperty('status', 'UP');
      expect(response).toHaveProperty('service', 'fmat-auth-backend');
      expect(response).toHaveProperty('version', '1.0.0');
    });

    it('should return health status', () => {
      const response = appController.getHealth();
      expect(response).toHaveProperty('status', 'healthy');
      expect(response.dependencies).toEqual({ rabbitmq: 'connected' });
      expect(new Date(response.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('[SEC #11] reporta "degraded" si RabbitMQ no está conectado', () => {
      eventsService.getStatus.mockReturnValue('disconnected');
      const response = appController.getHealth();
      expect(response.status).toBe('degraded');
      expect(response.dependencies.rabbitmq).toBe('disconnected');
    });

    it('reporta "healthy" si RabbitMQ está deshabilitado (sin RABBITMQ_URL)', () => {
      eventsService.getStatus.mockReturnValue('disabled');
      const response = appController.getHealth();
      expect(response.status).toBe('healthy');
      expect(response.dependencies.rabbitmq).toBe('disabled');
    });
  });
});
