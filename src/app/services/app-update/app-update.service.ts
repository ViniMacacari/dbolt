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
  private readonly ignoredReleasesStorageKey = 'dbolt-ignored-update-releases'

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

    if (this.isReleaseIgnored(platform, latestRelease)) {
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

  ignoreRelease(update: AppUpdateCheckResult): void {
    const releaseKey = this.getReleaseKey(update.platform, update.release)
    const ignoredReleases = this.readIgnoredReleases()

    if (ignoredReleases.includes(releaseKey)) {
      return
    }

    try {
      localStorage.setItem(
        this.ignoredReleasesStorageKey,
        JSON.stringify([...ignoredReleases, releaseKey].slice(-20))
      )
    } catch {
      // Ignoring an update is optional when browser storage is unavailable.
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

  private isReleaseIgnored(platform: AppDownloadPlatform, release: AppDownloadRelease): boolean {
    return this.readIgnoredReleases().includes(this.getReleaseKey(platform, release))
  }

  private getReleaseKey(platform: AppDownloadPlatform, release: AppDownloadRelease): string {
    return `${platform.id}:${release.version.trim().replace(/^v/i, '')}`
  }

  private readIgnoredReleases(): string[] {
    try {
      const value = JSON.parse(localStorage.getItem(this.ignoredReleasesStorageKey) || '[]') as unknown
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : []
    } catch {
      return []
    }
  }
}

