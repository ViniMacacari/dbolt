import { AiChatMessageComponent } from './ai-chat-message.component'

describe('AiChatMessageComponent SQL actions', () => {
  const createComponent = (content: string) => {
    const clipboard = {
      copyText: jasmine.createSpy().and.resolveTo()
    }
    const language = {
      getCurrentLanguage: () => 'pt-BR',
      translate: (key: string) => ({
        'aiAssistant.assistant': 'IA',
        'aiAssistant.copySql': 'Copiar SQL',
        'aiAssistant.openSqlInNewTab': 'Abrir em nova guia',
        'aiAssistant.copied': 'Copiado',
        'aiAssistant.copyFailed': 'Erro ao copiar'
      }[key] || key)
    }
    const sanitizer = {
      bypassSecurityTrustHtml: (value: string) => value
    }
    const component = new AiChatMessageComponent(
      language as any,
      sanitizer as any,
      clipboard as any
    )

    component.message = {
      id: 'assistant-message',
      role: 'assistant',
      content,
      createdAt: '2026-08-04T00:00:00.000Z'
    }
    component.ngOnChanges({})

    return { component, clipboard }
  }

  const getActionButton = (component: AiChatMessageComponent, action: string): HTMLButtonElement => {
    const container = document.createElement('div')
    container.innerHTML = String(component.formattedContent)
    const button = container.querySelector<HTMLButtonElement>(`button[data-ai-code-action="${action}"]`)

    if (!button) throw new Error(`Action button ${action} was not rendered.`)
    return button
  }

  const createClickEvent = (target: Element): MouseEvent => ({
    target,
    preventDefault: jasmine.createSpy(),
    stopPropagation: jasmine.createSpy()
  } as unknown as MouseEvent)

  it('renders copy and open actions only for SQL code blocks', () => {
    const sql = createComponent('```sql\nSELECT * FROM users;\n```')
    const javascript = createComponent('```javascript\nconsole.log("hello");\n```')

    expect(String(sql.component.formattedContent).match(/data-ai-code-action=/g)?.length).toBe(2)
    expect(String(javascript.component.formattedContent)).not.toContain('data-ai-code-action')

    sql.component.ngOnDestroy()
    javascript.component.ngOnDestroy()
  })

  it('does not add SQL actions to user messages', () => {
    const { component } = createComponent('```sql\nSELECT * FROM users;\n```')
    component.message = {
      ...component.message,
      role: 'user'
    }
    component.ngOnChanges({})

    expect(String(component.formattedContent)).not.toContain('data-ai-code-action')
    component.ngOnDestroy()
  })

  it('copies only the SQL code from the selected block', async () => {
    const { component, clipboard } = createComponent('Resposta:\n```sql\nSELECT id\nFROM users;\n```')
    const button = getActionButton(component, 'copy-sql')

    await component.onFormattedContentClick(createClickEvent(button))

    expect(clipboard.copyText).toHaveBeenCalledOnceWith('SELECT id\nFROM users;')
    component.ngOnDestroy()
  })

  it('emits the selected SQL when opening it in a new tab', async () => {
    const { component } = createComponent('```mysql\nSELECT name FROM customers;\n```')
    const emittedSql: string[] = []
    component.sqlRequested.subscribe((sql) => emittedSql.push(sql))
    const button = getActionButton(component, 'open-sql')

    await component.onFormattedContentClick(createClickEvent(button))

    expect(emittedSql).toEqual(['SELECT name FROM customers;'])
    component.ngOnDestroy()
  })
})
