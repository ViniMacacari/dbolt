import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class ApplicationCloseGuardService {
  private readonly unsavedSqlQueryChecks = new Set<() => boolean>()

  registerUnsavedSqlQueryCheck(check: () => boolean): () => void {
    this.unsavedSqlQueryChecks.add(check)

    return () => this.unsavedSqlQueryChecks.delete(check)
  }

  hasUnsavedSqlQueries(): boolean {
    return Array.from(this.unsavedSqlQueryChecks).some(check => check())
  }
}
