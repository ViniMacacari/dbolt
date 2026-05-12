import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'
import { AppLanguageService } from '../../services/language/app-language.service'

interface HelpSection {
  title: string
  description?: string
  items: string[]
}

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss'
})
export class HelpComponent {
  readonly repositoryUrl = 'https://github.com/ViniMacacari/dbolt'

  constructor(
    private router: Router,
    private language: AppLanguageService
  ) { }

  get sections(): HelpSection[] {
    return [
      {
        title: this.t('help.general.title'),
        description: this.t('help.general.description'),
        items: [
          this.t('help.general.item.home'),
          this.t('help.general.item.sidebar'),
          this.t('help.general.item.sqlTabs'),
          this.t('help.general.item.results')
        ]
      },
      {
        title: this.t('help.questions.title'),
        items: [
          this.t('help.questions.item.localConnections'),
          this.t('help.questions.item.localBackend'),
          this.t('help.questions.item.connectionFailure'),
          this.t('help.questions.item.largeResults')
        ]
      },
      {
        title: this.t('help.drivers.title'),
        description: this.t('help.drivers.description'),
        items: [
          this.t('help.drivers.item.protocol'),
          this.t('help.drivers.item.plugins'),
          this.t('help.drivers.item.behavior'),
          this.t('help.drivers.item.examples')
        ]
      }
    ]
  }

  goHome(): void {
    this.router.navigate(['/'])
  }

  t(key: string): string {
    return this.language.translate(key)
  }
}
