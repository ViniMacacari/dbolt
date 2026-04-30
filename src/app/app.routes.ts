import { Routes } from '@angular/router'

import { OpenPageComponent } from './pages/open-page/open-page.component'
import { DatabaseManagerComponent } from './pages/database-manager/database-manager.component'
import { HelpComponent } from './pages/help/help.component'

export const routes: Routes = [
    { path: '', component: OpenPageComponent },
    { path: 'help', component: HelpComponent },
    { path: 'database-management/:id', component: DatabaseManagerComponent },
]
