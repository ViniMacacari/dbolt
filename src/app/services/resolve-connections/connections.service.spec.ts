import { TestBed } from '@angular/core/testing';

import { ConnectionsService } from './connections.service';
import { InternalApiService } from '../requests/internal-api.service';
import { CacheManagerService } from '../cache/cache-manager.service';

describe('ConnectionsService', () => {
  let service: ConnectionsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ConnectionsService,
        { provide: InternalApiService, useValue: {} },
        { provide: CacheManagerService, useValue: {} }
      ]
    });
    service = TestBed.inject(ConnectionsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
