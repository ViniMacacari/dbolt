import { fakeAsync, tick } from '@angular/core/testing'

import { AiAssistantPanelComponent } from './ai-assistant-panel.component'

describe('AiAssistantPanelComponent conversation scrolling', () => {
  const createComponent = (): AiAssistantPanelComponent => new AiAssistantPanelComponent(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  )

  it('opens a loaded conversation at its final message', () => {
    const component = createComponent()
    const container = {
      scrollHeight: 840,
      scrollTop: 0
    }

    component.messages = [{
      id: 'last-message',
      role: 'assistant',
      content: 'Last answer',
      createdAt: '2026-07-20T00:00:00.000Z'
    }]
    const componentView = component as unknown as {
      messagesContainer: { nativeElement: typeof container }
    }
    componentView.messagesContainer = { nativeElement: container }

    component.ngAfterViewChecked()

    expect(container.scrollTop).toBe(840)
  })

  it('keeps the conversations modal mounted during its closing animation', fakeAsync(() => {
    const component = createComponent()

    component.openConversationsModal()
    component.closeConversationsModal()

    expect(component.showConversationsModal).toBeTrue()
    expect(component.conversationsModalClosing).toBeTrue()

    tick(180)

    expect(component.showConversationsModal).toBeFalse()
    expect(component.conversationsModalClosing).toBeFalse()
  }))
})
