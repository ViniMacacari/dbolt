import { Component, Renderer2, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading.component.html',
  styleUrl: './loading.component.scss'
})
export class LoadingComponent implements OnInit, OnDestroy {
  static instance: LoadingComponent | null = null
  isLoading = false
  seconds = 0
  minutes = 0
  @Input() global = false
  static interval: any = null
  static startTime = 0
  private static activeRequests = 0
  private defaultMessage = 'Connecting to database...'
  @Input() message = this.defaultMessage

  constructor(private renderer: Renderer2, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    if (this.global || !LoadingComponent.instance) {
      LoadingComponent.instance = this
    }
  }

  ngOnDestroy(): void {
    if (LoadingComponent.instance === this) {
      LoadingComponent.instance = null
    }
  }

  static show(message?: string) {
    const instance = LoadingComponent.instance
    if (!instance) {
      return
    }

    LoadingComponent.activeRequests += 1

    if (LoadingComponent.activeRequests === 1) {
      if (LoadingComponent.interval) {
        clearInterval(LoadingComponent.interval)
      }

      instance.seconds = 0
      instance.minutes = 0
      LoadingComponent.startTime = Date.now()

      LoadingComponent.interval = setInterval(() => {
        const elapsedTime = Math.floor((Date.now() - LoadingComponent.startTime) / 1000)
        instance.minutes = Math.floor(elapsedTime / 60)
        instance.seconds = elapsedTime % 60
        instance.cdr.detectChanges()
      }, 1000)
    }

    instance.isLoading = true
    instance.message = message || instance.defaultMessage
    instance.renderer.setStyle(document.body, 'overflow', 'hidden')
    instance.cdr.detectChanges()
  }

  static hide() {
    const instance = LoadingComponent.instance
    if (!instance) {
      LoadingComponent.activeRequests = 0
      return
    }

    LoadingComponent.activeRequests = Math.max(0, LoadingComponent.activeRequests - 1)
    if (LoadingComponent.activeRequests > 0) {
      return
    }

    if (LoadingComponent.interval) {
      clearInterval(LoadingComponent.interval)
      LoadingComponent.interval = null
    }

    instance.isLoading = false
    instance.message = instance.defaultMessage
    instance.seconds = 0
    instance.minutes = 0
    instance.renderer.removeStyle(document.body, 'overflow')
    instance.cdr.detectChanges()
  }
}
