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
})
