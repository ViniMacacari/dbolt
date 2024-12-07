import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core'
import { provideRouter } from '@angular/router'
import { provideHttpClient } from '@angular/common/http'

import { routes } from './app.routes'

(window as any).MonacoEnvironment = {
  getWorkerUrl: function (moduleId: string, label: string) {
    if (label === 'json') return './assets/monaco-editor/json.worker.js'
    if (label === 'css') return './assets/monaco-editor/css.worker.js'
    if (label === 'html') return './assets/monaco-editor/html.worker.js'
    if (label === 'typescript' || label === 'javascript') return './assets/monaco-editor/ts.worker.js'
    return './assets/monaco-editor/editor.worker.js'
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient()
  ]
}