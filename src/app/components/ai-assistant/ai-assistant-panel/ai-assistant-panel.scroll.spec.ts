import { AiAssistantPanelComponent } from './ai-assistant-panel.component'

describe('AiAssistantPanelComponent conversation scrolling', () => {
  it('opens a loaded conversation at its final message', () => {
    const component = new AiAssistantPanelComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    )
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
})
