import { Component, Renderer2, Input } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading.component.html',
  styleUrl: './loading.component.scss'
})
export class LoadingComponent {
  static instance: LoadingComponent
  isLoading = false
  seconds = 0
  minutes = 0
  static interval: any = null
  static startTime = 0
  @Input() message = 'Connecting to database...'

  constructor(private renderer: Renderer2) {
    LoadingComponent.instance = this
  }

  static show() {
    if (LoadingComponent.interval) {
      clearInterval(LoadingComponent.interval)
    }

    LoadingComponent.instance.isLoading = true
    LoadingComponent.instance.seconds = 0
    LoadingComponent.instance.minutes = 0
    LoadingComponent.instance.renderer.setStyle(document.body, 'overflow', 'hidden')
    LoadingComponent.startTime = Date.now()

    LoadingComponent.interval = setInterval(() => {
      const elapsedTime = Math.floor((Date.now() - LoadingComponent.startTime) / 1000)
      LoadingComponent.instance.minutes = Math.floor(elapsedTime / 60)
      LoadingComponent.instance.seconds = elapsedTime % 60
    }, 1000)
  }

  static hide() {
    if (LoadingComponent.interval) {
      clearInterval(LoadingComponent.interval)
      LoadingComponent.interval = null
    }
    LoadingComponent.instance.isLoading = false
    LoadingComponent.instance.seconds = 0
    LoadingComponent.instance.minutes = 0
    LoadingComponent.instance.renderer.removeStyle(document.body, 'overflow')
  }
}