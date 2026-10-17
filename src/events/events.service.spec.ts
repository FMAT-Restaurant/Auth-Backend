import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EventsService, StaffEventPayload } from './events.service';

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

    await service.publishStaffCreated(samplePayload);
    await service.publishStaffRolesUpdated(samplePayload);
    await service.publishStaffStatusChanged(samplePayload);
    await service.publishStaffDeleted({ userId: 'usr-1', staffId: 'M000001' });

    expect(mockChannel.publish).toHaveBeenCalledTimes(4);

    await service.onModuleDestroy();
    expect(mockChannel.close).toHaveBeenCalled();
    expect(mockConnection.close).toHaveBeenCalled();
  });

  it('debería manejar fallo de conexión en onModuleInit y publicar en modo mock sin canal', async () => {
    (amqp.connect as jest.Mock).mockRejectedValueOnce(new Error('Broker offline'));

    await service.onModuleInit();
    await service.publishStaffCreated(samplePayload);
    await service.publishStaffDeleted({ userId: 'usr-1', staffId: 'M000001' });

    expect(mockChannel.publish).not.toHaveBeenCalled();
  });

  it('debería manejar errores al publicar en el canal y al cerrar en onModuleDestroy', async () => {
    (amqp.connect as jest.Mock).mockResolvedValueOnce(mockConnection);
    await service.onModuleInit();

    mockChannel.publish.mockImplementationOnce(() => {
      throw new Error('Publish error');
    });

    await expect(service.publishStaffCreated(samplePayload)).resolves.toBeUndefined();

    mockChannel.close.mockRejectedValueOnce(new Error('Close error'));
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
