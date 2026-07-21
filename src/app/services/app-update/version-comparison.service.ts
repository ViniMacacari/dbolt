import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class VersionComparisonService {
  isNewerVersion(candidateVersion: string, currentVersion: string): boolean {
    return this.compare(candidateVersion, currentVersion) > 0
  }

  compare(leftVersion: string, rightVersion: string): number {
    const left = this.parseVersion(leftVersion)
    const right = this.parseVersion(rightVersion)
    const length = Math.max(left.core.length, right.core.length)

    for (let index = 0; index < length; index += 1) {
      const leftPart = left.core[index] ?? 0
      const rightPart = right.core[index] ?? 0

      if (leftPart > rightPart) return 1
      if (leftPart < rightPart) return -1
    }

    if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1
    if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1

    const prereleaseLength = Math.max(left.prerelease.length, right.prerelease.length)
    for (let index = 0; index < prereleaseLength; index += 1) {
      const leftPart = left.prerelease[index]
      const rightPart = right.prerelease[index]

      if (leftPart === undefined) return -1
      if (rightPart === undefined) return 1
      if (leftPart === rightPart) continue

      const leftNumber = Number(leftPart)
      const rightNumber = Number(rightPart)
      const leftIsNumber = Number.isInteger(leftNumber)
      const rightIsNumber = Number.isInteger(rightNumber)

      if (leftIsNumber && rightIsNumber) return leftNumber > rightNumber ? 1 : -1
      if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1

      return leftPart.localeCompare(rightPart, undefined, { sensitivity: 'base' }) > 0 ? 1 : -1
    }

    return 0
  }

  private parseVersion(version: string): { core: number[]; prerelease: string[] } {
    const normalized = version.trim().replace(/^v/i, '').split('+', 1)[0] || ''
    const separatorIndex = normalized.indexOf('-')
    const coreVersion = separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : normalized
    const prereleaseVersion = separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : ''

    return {
      core: coreVersion
        .split(/[^0-9]+/)
        .filter(Boolean)
        .map((part) => Number.parseInt(part, 10))
        .filter((part) => Number.isFinite(part)),
      prerelease: prereleaseVersion
        .split(/[.-]/)
        .map((part) => part.trim())
        .filter(Boolean)
    }
  }
}

