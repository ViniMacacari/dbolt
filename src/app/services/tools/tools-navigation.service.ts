import { Injectable } from '@angular/core'
import { Subject } from 'rxjs'

export type ToolDestination = 'database-export'

@Injectable({
  providedIn: 'root'
})
export class ToolsNavigationService {
  private readonly requestsSubject = new Subject<ToolDestination>()
  readonly requests$ = this.requestsSubject.asObservable()

  open(destination: ToolDestination): void {
    this.requestsSubject.next(destination)
  }
}
