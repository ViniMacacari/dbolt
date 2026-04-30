import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router } from '@angular/router'

interface HelpSection {
  title: string
  description?: string
  items: string[]
}

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss'
})
export class HelpComponent {
  readonly repositoryUrl = 'https://github.com/ViniMacacari/dbolt'

  readonly sections: HelpSection[] = [
    {
      title: 'General App Help',
      description: 'DBolt is a local database manager focused on connecting, browsing schemas, writing SQL, and inspecting query results.',
      items: [
        'Use the home screen to create, edit, remove, and open saved connections.',
        'Use the workspace sidebar to switch database/schema context and open database objects.',
        'Use SQL tabs to run selected SQL, full scripts, or the current statement.',
        'Use the result grid to inspect rows, copy selected data, and increase the row limit when needed.'
      ]
    },
    {
      title: 'Common Questions',
      items: [
        'Saved connections are local to this machine.',
        'The backend runs locally and is used by the frontend to execute database operations.',
        'If a connection fails, check host, port, user, password, network access, and database driver availability.',
        'Large result sets are loaded with a max row limit to avoid freezing the app.'
      ]
    },
    {
      title: 'Drivers',
      description: 'Drivers are the fixed database adapters DBolt uses to communicate with each database engine through the local backend.',
      items: [
        'Each driver maps DBolt actions to a specific database protocol and SQL dialect.',
        'Drivers are not user-created plugins in this version; they are built into the app.',
        'The selected driver controls connection behavior, schema loading, metadata queries, and query execution.',
        'Examples include HANA, PostgreSQL, MySQL, and SQL Server versions supported by the app.'
      ]
    }
  ]

  constructor(private router: Router) { }

  goHome(): void {
    this.router.navigate(['/'])
  }
}
