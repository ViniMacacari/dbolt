import { AiChatInputComponent } from './ai-chat-input.component'

describe('AiChatInputComponent', () => {
  const createComponent = (): AiChatInputComponent => new AiChatInputComponent({
    translate: (key: string) => key
  } as any)

  it('does not include the current SQL by default', () => {
    const component = createComponent()
    component.currentSqlAvailable = true
    component.message = 'Explain this query'
    let submitted: any
    component.send.subscribe((event) => submitted = event)

    component.submit()

    expect(component.includeCurrentSql).toBeFalse()
    expect(submitted.includeCurrentSql).toBeFalse()
  })

  it('includes the current SQL only when the toggle is enabled and SQL is available', () => {
    const component = createComponent()
    component.currentSqlAvailable = true
    component.includeCurrentSql = true
    component.message = 'Explain this query'
    let submitted: any
    component.send.subscribe((event) => submitted = event)

    component.submit()

    expect(submitted.includeCurrentSql).toBeTrue()

    component.currentSqlAvailable = false
    component.message = 'Explain again'
    component.submit()

    expect(submitted.includeCurrentSql).toBeFalse()
  })

  it('inserts a line break instead of submitting when Shift+Enter is pressed', () => {
    const component = createComponent()
    const textarea = document.createElement('textarea')
    textarea.value = 'First lineSecond line'
    textarea.setSelectionRange(10, 10)
    component.message = textarea.value
    const submitSpy = spyOn(component, 'submit')
    const event = {
      key: 'Enter',
      isComposing: false,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      target: textarea,
      stopPropagation: jasmine.createSpy(),
      preventDefault: jasmine.createSpy()
    } as unknown as KeyboardEvent

    component.onTextareaKeydown(event)

    expect(component.message).toBe('First line\nSecond line')
    expect(textarea.value).toBe('First line\nSecond line')
    expect(submitSpy).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })
})
