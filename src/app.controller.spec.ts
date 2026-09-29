import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
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
      expect(response).toHaveProperty('timestamp');
      expect(new Date(response.timestamp).toString()).not.toBe('Invalid Date');
    });
  });
});
