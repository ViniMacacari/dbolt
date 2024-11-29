import { Component, Renderer2 } from '@angular/core'
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

  constructor(private renderer: Renderer2) {
    LoadingComponent.instance = this
  }

  static show() {
    LoadingComponent.instance.isLoading = true
    LoadingComponent.instance.renderer.setStyle(document.body, 'overflow', 'hidden')
  }

  static hide() {
    LoadingComponent.instance.isLoading = false
    LoadingComponent.instance.renderer.removeStyle(document.body, 'overflow')
  }
}