import { fakeAsync, tick } from '@angular/core/testing'

import { AiAssistantPanelComponent } from './ai-assistant-panel.component'

describe('AiAssistantPanelComponent conversation scrolling', () => {
  const createComponent = (): AiAssistantPanelComponent => new AiAssistantPanelComponent(
    {} as any,
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

  it('ensures a live connection before building readonly AI context', async () => {
    const connectedContext = {
      connectionKey: 'ai-context',
      connId: 7,
      sgbd: 'mysql',
      version: 'v5',
      database: 'sales'
    }
    const databaseContext = {
      buildRuntimeConnectionContext: jasmine.createSpy().and.returnValue({
        connId: 7,
        sgbd: 'mysql',
        version: 'v5',
        database: 'sales'
      }),
      buildReadonlyToolContext: jasmine.createSpy().and.returnValue({
        connectionKey: 'ai-context',
        sgbd: 'mysql',
        version: 'v5',
        database: 'sales'
      })
    }
    const connectionContext = {
      createContext: jasmine.createSpy().and.returnValue(connectedContext),
      ensureContext: jasmine.createSpy().and.resolveTo(connectedContext)
    }
    const component = new AiAssistantPanelComponent(
      {} as any,
      {} as any,
      {} as any,
      databaseContext as any,
      {} as any,
      connectionContext as any
    )

    const result = await (component as any).prepareReadonlyToolContext()

    expect(connectionContext.ensureContext).toHaveBeenCalledOnceWith(connectedContext)
    expect(databaseContext.buildReadonlyToolContext).toHaveBeenCalled()
    expect(result.connectionKey).toBe('ai-context')
  })
})
