import { CommonModule } from '@angular/common'
import { Component } from '@angular/core'
import { AppSettingsService } from '../../../services/app-settings/app-settings.service'

type SettingsTab = 'query'

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  activeTab: SettingsTab = 'query'
  defaultQueryRows: number
  savedMessage: string = ''

  constructor(private settings: AppSettingsService) {
    this.defaultQueryRows = this.settings.getDefaultQueryRows()
  }

  selectTab(tab: SettingsTab): void {
    this.activeTab = tab
  }

  onDefaultRowsInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(value)) return

    this.defaultQueryRows = Math.max(1, Math.floor(value))
    this.savedMessage = ''
  }

  saveDefaultRows(): void {
    const settings = this.settings.setDefaultQueryRows(this.defaultQueryRows)
    this.defaultQueryRows = settings.defaultQueryRows
    this.savedMessage = 'Saved'
  }
}
