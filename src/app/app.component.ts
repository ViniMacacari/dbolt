import { CommonModule } from '@angular/common'
import { Component, OnInit } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { ApplicationMenuComponent } from './components/application-menu/application-menu.component'
import { LoadingComponent } from "./components/modal/loading/loading.component"
import { AppUpdateComponent } from './components/modal/app-update/app-update.component'
import { AppUpdateCheckResult } from './services/app-update/app-update.model'
import { AppUpdateInstallerService } from './services/app-update/app-update-installer.service'
import { AppUpdateService } from './services/app-update/app-update.service'
import { AppLanguageService } from './services/language/app-language.service'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ApplicationMenuComponent, LoadingComponent, AppUpdateComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'dbolt'
  availableUpdate: AppUpdateCheckResult | null = null
  isUpdateModalOpen = false
  isInstallingUpdate = false
  updateErrorMessage = ''

  constructor(
    private appUpdate: AppUpdateService,
    private updateInstaller: AppUpdateInstallerService,
    private language: AppLanguageService
  ) { }

  ngOnInit(): void {
    void this.checkForUpdates()
  }

  closeUpdateModal(): void {
    this.isUpdateModalOpen = false
    this.availableUpdate = null
    this.updateErrorMessage = ''
  }

  async installUpdate(): Promise<void> {
    if (!this.availableUpdate || this.isInstallingUpdate) {
      return
    }

    this.isInstallingUpdate = true
    this.updateErrorMessage = ''

    try {
      await this.updateInstaller.downloadAndOpenInstaller(this.availableUpdate.release)
      this.closeUpdateModal()
    } catch (error) {
      console.error('Could not install update:', error)
      this.updateErrorMessage = this.language.translate('appUpdate.installFailed')
    } finally {
      this.isInstallingUpdate = false
    }
  }

  private async checkForUpdates(): Promise<void> {
    try {
      const update = await this.appUpdate.checkForStableUpdate()
      if (!update) {
        return
      }

      this.availableUpdate = update
      this.isUpdateModalOpen = true
    } catch (error) {
      console.warn('Could not check for app updates:', error)
    }
  }
}
