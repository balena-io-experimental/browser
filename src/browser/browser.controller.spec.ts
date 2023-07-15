import { Test, TestingModule } from '@nestjs/testing';
import { BrowserController } from './browser.controller';
import { BrowserService } from './browser.service';

describe('BrowserController', () => {
  let controller: BrowserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrowserController],
      providers: [BrowserService],
    }).compile();

    controller = module.get<BrowserController>(BrowserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
