import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class CacheManagerService {
  private cache = new Map<string, unknown>()

  has(key: string): boolean {
    return this.cache.has(key)
  }

  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined
  }

  set<T>(key: string, value: T): void {
    this.cache.set(key, value)
  }

  update<T>(key: string, updater: (currentValue: T | undefined) => T): T {
    const updatedValue = updater(this.get<T>(key))
    this.set(key, updatedValue)

    return updatedValue
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }
}
