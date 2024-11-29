import { Component, ElementRef, Renderer2 } from '@angular/core'
import { CommonModule } from '@angular/common'

declare var bootstrap: any

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss']
})
export class ToastComponent {
  toasts: { message: string, color: string }[] = []

  showToast(message: string, color: string) {
    const toast = { message, color }
    this.toasts.push(toast)

    setTimeout(() => {
      this.removeToast(toast)
    }, 3000)
  }

  removeToast(toast: { message: string, color: string }) {
    this.toasts = this.toasts.filter(t => t !== toast)
  }
}