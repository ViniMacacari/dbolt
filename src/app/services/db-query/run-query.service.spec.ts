import { TestBed } from '@angular/core/testing';

import { RunQueryService } from './run-query.service';

describe('RunQueryService', () => {
  let service: RunQueryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RunQueryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
