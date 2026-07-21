import { TestBed } from '@angular/core/testing'

import { ApplicationCloseGuardService } from './application-close-guard.service'

describe('ApplicationCloseGuardService', () => {
  let service: ApplicationCloseGuardService

  beforeEach(() => {
    TestBed.configureTestingModule({})
    service = TestBed.inject(ApplicationCloseGuardService)
  })

  it('should identify an unsaved SQL query from a registered check', () => {
    service.registerUnsavedSqlQueryCheck(() => true)

    expect(service.hasUnsavedSqlQueries()).toBeTrue()
  })

  it('should ignore a check after it is unregistered', () => {
    const unregister = service.registerUnsavedSqlQueryCheck(() => true)

    unregister()

    expect(service.hasUnsavedSqlQueries()).toBeFalse()
  })
})
