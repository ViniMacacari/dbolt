import { TestBed } from '@angular/core/testing';

import { InternalApiService } from './internal-api.service';

describe('InternalApiService', () => {
  let service: InternalApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InternalApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
