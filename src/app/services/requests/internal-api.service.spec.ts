import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';

import { InternalApiService } from './internal-api.service';
import { InternalSessionTokenService } from './internal-session-token.service';

describe('InternalApiService', () => {
  let service: InternalApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: {} },
        { provide: InternalSessionTokenService, useValue: { getToken: () => Promise.resolve('test-token') } }
      ]
    });
    service = TestBed.inject(InternalApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
