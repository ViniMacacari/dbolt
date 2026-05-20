export type AppUpdatePlatformId = 'windows' | 'linux' | 'macos' | 'unknown'

export interface AppUpdatePlatformInfo {
  platform: AppUpdatePlatformId
  canOpenInstaller: boolean
}

export interface AppDownloadPlatform {
  id: string
  label: string
  available?: boolean
  stableReleaseId?: string
  latestReleaseId?: string
}

export interface AppDownloadRelease {
  id: string
  platform: string
  platformLabel?: string
  arch?: string
  version: string
  displayVersion?: string
  channel?: string
  label?: string
  format?: string
  fileName?: string
  url: string
  badge?: string
  stable?: boolean
  latest?: boolean
}

export interface AppDownloadsManifest {
  schemaVersion: number
  app?: {
    id?: string
    name?: string
    displayName?: string
  }
  platforms: AppDownloadPlatform[]
  releases: AppDownloadRelease[]
}

export interface AppUpdateCheckResult {
  currentVersion: string
  platform: AppDownloadPlatform
  release: AppDownloadRelease
  nativeInstallAvailable: boolean
}

