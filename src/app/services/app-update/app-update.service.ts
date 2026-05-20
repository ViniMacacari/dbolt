import { Injectable } from '@angular/core'

import {
  AppDownloadPlatform,
  AppDownloadRelease,
  AppUpdateCheckResult
} from './app-update.model'
import { AppInstalledVersionService } from './app-installed-version.service'
import { AppUpdateManifestService } from './app-update-manifest.service'
import { VersionComparisonService } from './version-comparison.service'

@Injectable({
  providedIn: 'root'
})
export class AppUpdateService {
  constructor(
    private installedVersion: AppInstalledVersionService,
    private manifestService: AppUpdateManifestService,
    private versionComparison: VersionComparisonService
  ) { }

  async checkForStableUpdate(): Promise<AppUpdateCheckResult | null> {
    if (!this.manifestService.isNativeUpdateApiAvailable()) {
      return null
    }

    const [currentVersion, platformInfo, manifest] = await Promise.all([
      this.installedVersion.getInstalledVersion(),
      this.manifestService.getPlatformInfo(),
      this.manifestService.getDownloadsManifest()
    ])

    const platform = manifest.platforms.find((item) =>
      item.id === platformInfo.platform && item.available !== false
    )

    if (!platform) {
      return null
    }

    const stableRelease = this.resolveStableRelease(platform, manifest.releases)
    if (!stableRelease || !this.versionComparison.isNewerVersion(stableRelease.version, currentVersion)) {
      return null
    }

    return {
      currentVersion,
      platform,
      release: stableRelease,
      nativeInstallAvailable: platformInfo.canOpenInstaller
    }
  }

  private resolveStableRelease(
    platform: AppDownloadPlatform,
    releases: AppDownloadRelease[]
  ): AppDownloadRelease | null {
    if (platform.stableReleaseId) {
      return releases.find((release) => release.id === platform.stableReleaseId) ?? null
    }

    return releases.find((release) =>
      release.platform === platform.id && release.stable === true
    ) ?? null
  }
}

