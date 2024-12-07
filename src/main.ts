import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

(window as any).MonacoEnvironment = {
  getWorkerUrl: function (moduleId: string, label: string) {
    if (label === 'json') return './assets/monaco-editor/json.worker.js';
    if (label === 'css') return './assets/monaco-editor/css.worker.js';
    if (label === 'html') return './assets/monaco-editor/html.worker.js';
    if (label === 'typescript' || label === 'javascript') return './assets/monaco-editor/ts.worker.js';
    return './assets/monaco-editor/editor.worker.js';
  }
};

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
