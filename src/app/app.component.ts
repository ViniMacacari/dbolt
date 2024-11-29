import { Component } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { LoadingComponent } from "./components/modal/loading/loading.component"

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LoadingComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'dbolt'
}