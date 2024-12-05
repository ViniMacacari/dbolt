import { TestBed } from '@angular/core/testing';

import { GetDbschemaService } from './get-dbschema.service';

describe('GetDbschemaService', () => {
  let service: GetDbschemaService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GetDbschemaService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
