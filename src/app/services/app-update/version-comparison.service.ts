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
    const length = Math.max(left.length, right.length)

    for (let index = 0; index < length; index += 1) {
      const leftPart = left[index] ?? 0
      const rightPart = right[index] ?? 0

      if (leftPart > rightPart) return 1
      if (leftPart < rightPart) return -1
    }

    return 0
  }

  private parseVersion(version: string): number[] {
    return version
      .trim()
      .replace(/^v/i, '')
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isFinite(part))
  }
}

