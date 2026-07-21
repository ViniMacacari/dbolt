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

  async checkForUpdate(): Promise<AppUpdateCheckResult | null> {
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

    const latestRelease = this.resolveLatestRelease(platform, manifest.releases)
    if (!latestRelease || !this.versionComparison.isNewerVersion(latestRelease.version, currentVersion)) {
      return null
    }

    return {
      currentVersion,
      platform,
      release: latestRelease,
      nativeInstallAvailable: platformInfo.canOpenInstaller,
      isPrerelease: this.isPrerelease(latestRelease)
    }
  }

  private resolveLatestRelease(
    platform: AppDownloadPlatform,
    releases: AppDownloadRelease[]
  ): AppDownloadRelease | null {
    const platformReleases = releases.filter((release) =>
      release.platform === platform.id && Boolean(release.url)
    )

    if (platformReleases.length === 0) {
      return null
    }

    const designatedLatestRelease = platform.latestReleaseId
      ? platformReleases.find((release) => release.id === platform.latestReleaseId)
      : null

    if (designatedLatestRelease) {
      return designatedLatestRelease
    }

    return [...platformReleases].sort((left, right) => {
      const versionDifference = this.versionComparison.compare(right.version, left.version)
      if (versionDifference !== 0) {
        return versionDifference
      }

      const leftIsDesignatedLatest = left.id === platform.latestReleaseId || left.latest === true
      const rightIsDesignatedLatest = right.id === platform.latestReleaseId || right.latest === true
      if (leftIsDesignatedLatest !== rightIsDesignatedLatest) {
        return rightIsDesignatedLatest ? 1 : -1
      }

      const leftIsStable = !this.isPrerelease(left)
      const rightIsStable = !this.isPrerelease(right)
      if (leftIsStable !== rightIsStable) {
        return rightIsStable ? 1 : -1
      }

      return 0
    })[0] ?? null
  }

  private isPrerelease(release: AppDownloadRelease): boolean {
    if (release.stable === true || release.channel?.trim().toLowerCase() === 'stable') {
      return false
    }

    if (release.stable === false) {
      return true
    }

    const channel = release.channel?.trim().toLowerCase()
    return Boolean(channel && channel !== 'stable') || release.version.includes('-')
  }
}

