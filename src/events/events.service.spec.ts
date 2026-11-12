import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { Logger } from '@nestjs/common';
import { EventsService, StaffEventPayload, maskCredentials } from './events.service';

jest.mock('amqplib');

describe('EventsService', () => {
  let service: EventsService;
  let configService: ConfigService;
  let mockChannel: {
    assertExchange: jest.Mock;
    publish: jest.Mock;
    close: jest.Mock;
  };
  let mockConnection: {
    createChannel: jest.Mock;
    close: jest.Mock;
  };

  const samplePayload: StaffEventPayload = {
    userId: 'usr-1',
    staffId: 'M000001',
    firstName: 'Juan',
    lastName: 'Pérez',
    roles: ['MESERO'],
    isActive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configService = {
      get: jest.fn().mockReturnValue('amqp://localhost:5672'),
    } as unknown as ConfigService;

    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockReturnValue(true),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue(undefined),
    };

    service = new EventsService(configService);
  });

  it('debería conectarse a RabbitMQ en onModuleInit y publicar todos los tipos de eventos', async () => {
    (amqp.connect as jest.Mock).mockResolvedValueOnce(mockConnection);

    await service.onModuleInit();
    expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost:5672');
    expect(mockChannel.assertExchange).toHaveBeenCalled();

    service.publishStaffCreated(samplePayload);
    service.publishStaffRolesUpdated(samplePayload);
    service.publishStaffStatusChanged(samplePayload);
    service.publishStaffDeleted({ userId: 'usr-1', staffId: 'M000001' });

    expect(mockChannel.publish).toHaveBeenCalledTimes(4);

    await service.onModuleDestroy();
    expect(mockChannel.close).toHaveBeenCalled();
    expect(mockConnection.close).toHaveBeenCalled();
  });

  it('debería manejar fallo de conexión en onModuleInit y publicar en modo mock sin canal', async () => {
    (amqp.connect as jest.Mock).mockRejectedValueOnce(new Error('Broker offline'));

    await service.onModuleInit();
    service.publishStaffCreated(samplePayload);
    service.publishStaffDeleted({ userId: 'usr-1', staffId: 'M000001' });

    expect(mockChannel.publish).not.toHaveBeenCalled();
  });

  it('debería manejar errores al publicar en el canal y al cerrar en onModuleDestroy', async () => {
    (amqp.connect as jest.Mock).mockResolvedValueOnce(mockConnection);
    await service.onModuleInit();

    mockChannel.publish.mockImplementationOnce(() => {
      throw new Error('Publish error');
    });

    expect(() => service.publishStaffCreated(samplePayload)).not.toThrow();

    mockChannel.close.mockRejectedValueOnce(new Error('Close error'));
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  describe('[SEC #11] estado del broker', () => {
    it('isConnected refleja si hay canal con RabbitMQ', async () => {
      expect(service.isConnected()).toBe(false);
      (amqp.connect as jest.Mock).mockResolvedValueOnce(mockConnection);
      await service.onModuleInit();
      expect(service.isConnected()).toBe(true);
    });

    it('si se pierde la conexión, deja de reportarse como conectado', async () => {
      const handlers: Record<string, () => void> = {};
      const connection = {
        ...mockConnection,
        on: jest.fn((event: string, cb: () => void) => {
          handlers[event] = cb;
        }),
      };
      (amqp.connect as jest.Mock).mockResolvedValueOnce(connection);
      await service.onModuleInit();
      expect(service.isConnected()).toBe(true);

      handlers.close();
      expect(service.isConnected()).toBe(false);
    });

    it('en producción registra la falla como error, no como advertencia', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const prodConfig = {
        get: jest.fn((key: string) =>
          key === 'NODE_ENV' ? 'production' : 'amqp://fmat:secreta@broker:5672',
        ),
      } as unknown as ConfigService;
      const prodService = new EventsService(prodConfig);
      (amqp.connect as jest.Mock).mockRejectedValueOnce(
        new Error('ACCESS_REFUSED - Login was refused'),
      );

      await prodService.onModuleInit();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('NO se están publicando'));
      expect(errorSpy).toHaveBeenCalledWith(expect.not.stringContaining('secreta'));
      expect(warnSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('oculta la contraseña de la URL en los logs', () => {
      expect(maskCredentials('amqp://fmat:secreta@broker:5672/vhost')).toBe(
        'amqp://fmat:***@broker:5672/vhost',
      );
      expect(maskCredentials('amqp://localhost:5672')).toBe('amqp://localhost:5672');
    });
  });
});
