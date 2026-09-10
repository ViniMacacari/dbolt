import { fakeAsync, tick } from '@angular/core/testing'

import { DatabaseMemoryChatComponent } from './database-memory-chat.component'
import { DatabaseMemoryService } from '../../../services/database-memory/database-memory.service'
import { AppLanguageService } from '../../../services/language/app-language.service'

describe('DatabaseMemoryChatComponent', () => {
  let component: DatabaseMemoryChatComponent
  let memory: jasmine.SpyObj<DatabaseMemoryService>

  beforeEach(() => {
    memory = jasmine.createSpyObj('DatabaseMemoryService', [
      'load', 'getStorageFolder', 'describeScope', 'runInterview', 'addNotes', 'updateNote', 'deleteNote'
    ])
    memory.describeScope.and.returnValue('SAP PRD / Hana / SBOSERILON')
    component = new DatabaseMemoryChatComponent(memory, {
      translate: (key: string) => key
    } as AppLanguageService)
  })

  it('waits for the exit animation before closing', fakeAsync(() => {
    const closed = spyOn(component.closed, 'emit')
    component.close()
    component.close()
    expect(component.closing).toBeTrue()
    tick(279)
    expect(closed).not.toHaveBeenCalled()
    tick(1)
    expect(closed).toHaveBeenCalledTimes(1)
  }))

  it('closes the innermost popup first when Escape is pressed', fakeAsync(() => {
    component.instructionPopupOpen = true
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const preventDefault = spyOn(event, 'preventDefault')
    const stopPropagation = spyOn(event, 'stopPropagation')

    component.onKeydown(event)

    expect(component.instructionPopupClosing).toBeTrue()
    expect(component.closing).toBeFalse()
    expect(preventDefault).toHaveBeenCalled()
    expect(stopPropagation).toHaveBeenCalled()
    tick(250)
    expect(component.instructionPopupOpen).toBeFalse()
  }))

  it('closes the main dialog with Escape when no popup is open', fakeAsync(() => {
    const closed = spyOn(component.closed, 'emit')
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(component.closing).toBeTrue()
    tick(280)
    expect(closed).toHaveBeenCalledTimes(1)
  }))

  it('clears pending animation callbacks when destroyed', fakeAsync(() => {
    const closed = spyOn(component.closed, 'emit')
    component.close()
    component.ngOnDestroy()
    tick(280)
    expect(closed).not.toHaveBeenCalled()
  }))
})
