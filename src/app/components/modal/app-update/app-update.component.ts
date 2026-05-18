import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { AppUpdateCheckResult } from '../../../services/app-update/app-update.model'
import { AppLanguageService } from '../../../services/language/app-language.service'

@Component({
  selector: 'app-update-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-update.component.html',
  styleUrl: './app-update.component.scss'
})
export class AppUpdateComponent {
  @Input() update: AppUpdateCheckResult | null = null
  @Input() isInstalling = false
  @Input() errorMessage = ''
  @Output() closeAction = new EventEmitter<void>()
  @Output() updateAction = new EventEmitter<void>()

  constructor(private language: AppLanguageService) { }

  get targetVersion(): string {
    return this.update?.release.displayVersion || this.update?.release.version || ''
  }

  get currentVersion(): string {
    return this.update?.currentVersion || ''
  }

  get platformLabel(): string {
    return this.update?.platform.label || this.update?.release.platformLabel || ''
  }

  close(): void {
    if (!this.isInstalling) {
      this.closeAction.emit()
    }
  }

  updateNow(): void {
    if (!this.isInstalling) {
      this.updateAction.emit()
    }
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }
}

