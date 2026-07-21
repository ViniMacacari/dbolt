import { CommonModule } from '@angular/common'
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { ApplicationMenuComponent } from './components/application-menu/application-menu.component'
import { LoadingComponent } from "./components/modal/loading/loading.component"
import { AppUpdateComponent } from './components/modal/app-update/app-update.component'
import { AppUpdateCheckResult, AppUpdateDownloadProgress } from './services/app-update/app-update.model'
import { AppUpdateInstallerService } from './services/app-update/app-update-installer.service'
import { AppUpdateService } from './services/app-update/app-update.service'
import { AppLanguageService } from './services/language/app-language.service'
import { YesNoModalComponent } from './components/modal/yes-no-modal/yes-no-modal.component'
import { ApplicationCloseGuardService } from './services/application-close/application-close-guard.service'
import { AppThemeService } from './services/theme/app-theme.service'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ApplicationMenuComponent, LoadingComponent, AppUpdateComponent, YesNoModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'dbolt'
  availableUpdate: AppUpdateCheckResult | null = null
  isUpdateModalOpen = false
  isInstallingUpdate = false
  updateDownloadProgress: AppUpdateDownloadProgress | null = null
  updateErrorMessage = ''
  isCloseConfirmationOpen = false

  private removeCloseRequestedListener: (() => void) | null = null

  constructor(
    private appUpdate: AppUpdateService,
    private updateInstaller: AppUpdateInstallerService,
    private language: AppLanguageService,
    private applicationCloseGuard: ApplicationCloseGuardService,
    private appTheme: AppThemeService,
    private ngZone: NgZone
  ) { }

  ngOnInit(): void {
    this.appTheme.initialize()
    void this.checkForUpdates()

    this.removeCloseRequestedListener = window.dboltWindow?.onCloseRequested(() => {
      this.handleApplicationCloseRequest()
    }) ?? null
  }

  ngOnDestroy(): void {
    this.removeCloseRequestedListener?.()
  }

  cancelApplicationClose(): void {
    this.isCloseConfirmationOpen = false
    void window.dboltWindow?.respondToCloseRequest(false)
  }

  confirmApplicationClose(): void {
    this.isCloseConfirmationOpen = false
    void window.dboltWindow?.respondToCloseRequest(true)
  }

  t(key: string): string {
    return this.language.translate(key)
  }

  closeUpdateModal(): void {
    this.isUpdateModalOpen = false
    this.availableUpdate = null
    this.updateDownloadProgress = null
    this.updateErrorMessage = ''
  }

  async installUpdate(): Promise<void> {
    if (!this.availableUpdate || this.isInstallingUpdate) {
      return
    }

    this.isInstallingUpdate = true
    this.updateDownloadProgress = null
    this.updateErrorMessage = ''

    try {
      await this.updateInstaller.downloadAndOpenInstaller(this.availableUpdate.release, (progress) => {
        this.ngZone.run(() => {
          this.updateDownloadProgress = progress
        })
      })
      this.closeUpdateModal()
    } catch (error) {
      console.error('Could not install update:', error)
      this.updateDownloadProgress = null
      this.updateErrorMessage = this.language.translate('appUpdate.installFailed')
    } finally {
      this.isInstallingUpdate = false
    }
  }

  private async checkForUpdates(): Promise<void> {
    try {
      const update = await this.appUpdate.checkForUpdate()
      if (!update) {
        return
      }

      this.availableUpdate = update
      this.isUpdateModalOpen = true
    } catch (error) {
      console.warn('Could not check for app updates:', error)
    }
  }

  private handleApplicationCloseRequest(): void {
    if (this.applicationCloseGuard.hasUnsavedSqlQueries()) {
      this.isCloseConfirmationOpen = true
      return
    }

    void window.dboltWindow?.respondToCloseRequest(true)
  }
}
