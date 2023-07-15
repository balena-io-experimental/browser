import { Test, TestingModule } from '@nestjs/testing';
import { BrowserService } from './browser.service';

describe('BrowserService', () => {
  let service: BrowserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BrowserService],
    }).compile();

    service = module.get<BrowserService>(BrowserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
