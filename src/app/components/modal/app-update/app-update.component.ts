import { CommonModule } from '@angular/common'
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core'

import {
  AppUpdateCheckResult,
  AppUpdateDownloadProgress
} from '../../../services/app-update/app-update.model'
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
  @Input() progress: AppUpdateDownloadProgress | null = null
  @Input() errorMessage = ''
  @Output() closeAction = new EventEmitter<void>()
  @Output() updateAction = new EventEmitter<void>()

  constructor(private language: AppLanguageService) { }

  get targetVersion(): string {
    const version = this.update?.release.version || ''
    return version ? `v${version.replace(/^v/i, '')}` : ''
  }

  get currentVersion(): string {
    return (this.update?.currentVersion || '').replace(/^v/i, '')
  }

  get platformLabel(): string {
    return this.update?.platform.label || this.update?.release.platformLabel || ''
  }

  get releaseChannel(): string {
    const channel = this.update?.release.channel?.trim()
    if (!channel) {
      return this.update?.isPrerelease ? this.t('appUpdate.preview') : this.t('appUpdate.stable')
    }

    return channel.charAt(0).toUpperCase() + channel.slice(1).toLowerCase()
  }

  get downloadPercentage(): number | null {
    return this.progress?.percentage ?? null
  }

  get roundedDownloadPercentage(): number {
    return Math.round(this.downloadPercentage ?? 0)
  }

  get progressBarWidth(): string {
    return `${Math.max(0, Math.min(100, this.downloadPercentage ?? 0))}%`
  }

  get progressStatus(): string {
    if (this.progress?.phase === 'opening') {
      return this.t('appUpdate.openingInstaller')
    }

    if (this.progress?.phase === 'downloading') {
      return this.t('appUpdate.downloading')
    }

    return this.t('appUpdate.preparingDownload')
  }

  get progressDetail(): string {
    if (!this.progress || this.progress.phase === 'preparing') {
      return this.t('appUpdate.preparingDescription')
    }

    if (this.progress.phase === 'opening') {
      return this.t('appUpdate.downloadComplete')
    }

    const received = this.formatBytes(this.progress.receivedBytes)
    if (this.progress.totalBytes !== null) {
      return this.t('appUpdate.downloadedOf', {
        received,
        total: this.formatBytes(this.progress.totalBytes)
      })
    }

    return this.t('appUpdate.downloaded', { received })
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close()
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

  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B'
    }

    const units = ['B', 'KB', 'MB', 'GB']
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / (1024 ** unitIndex)
    const digits = unitIndex >= 2 && value < 10 ? 1 : 0

    return `${value.toFixed(digits)} ${units[unitIndex]}`
  }
}

