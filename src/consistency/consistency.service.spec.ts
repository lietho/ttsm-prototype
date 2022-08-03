import { Test, TestingModule } from '@nestjs/testing';
import { ConsistencyService } from './consistency.service';

describe('ConsistencyService', () => {
  let service: ConsistencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConsistencyService],
    }).compile();

    service = module.get<ConsistencyService>(ConsistencyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
