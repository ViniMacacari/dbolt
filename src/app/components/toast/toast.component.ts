import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'

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
    const toast = {
      message: String(message || ''),
      color: this.normalizeColor(color)
    }
    this.toasts.push(toast)

    setTimeout(() => {
      this.removeToast(toast)
    }, 3000)
  }

  removeToast(toast: { message: string, color: string }) {
    this.toasts = this.toasts.filter(t => t !== toast)
  }

  private normalizeColor(color: string): string {
    const normalizedColor = String(color || '').trim().toLowerCase()
    const colorMap: Record<string, string> = {
      danger: '#dc3545',
      error: '#dc3545',
      red: '#dc3545',
      success: '#198754',
      green: '#198754',
      warning: '#ffc107',
      yellow: '#ffc107',
      info: '#0dcaf0',
      blue: '#0d6efd'
    }

    return colorMap[normalizedColor] || color || '#0d6efd'
  }
}
