import { Injectable } from '@angular/core'
import { ConnectionContextService } from '../connection-context/connection-context.service'
import { InternalApiService } from '../requests/internal-api.service'

export type DiagramScope = 'object' | 'schema'
export type DiagramObjectKind = 'table' | 'view'

export interface DiagramColumn {
  name: string
  dataType: string
  nullable: boolean
  primaryKey: boolean
  ordinal: number
}

export interface DiagramEntity {
  id: string
  name: string
  kind: DiagramObjectKind
  columns: DiagramColumn[]
}

export interface DiagramRelation {
  id: string
  name?: string
  sourceEntity: string
  sourceColumn: string
  targetEntity: string
  targetColumn: string
}

export interface DatabaseDiagram {
  scope: DiagramScope
  title: string
  objectCount: number
  maxObjects: number
  limited: boolean
  entities: DiagramEntity[]
  relations: DiagramRelation[]
}

export interface DiagramRequest {
  scope: DiagramScope
  context: any
  objectName?: string
  objectType?: DiagramObjectKind
}

@Injectable({ providedIn: 'root' })
export class DatabaseDiagramService {
  constructor(
    private api: InternalApiService,
    private connectionContext: ConnectionContextService
  ) { }

  async load(request: DiagramRequest): Promise<{ diagram: DatabaseDiagram; context: any }> {
    const context = await this.connectionContext.ensureContext(request.context)
    const path = request.scope === 'object'
      ? `/diagram/object/${encodeURIComponent(request.objectName || '')}`
      : '/diagram/schema'
    const result: any = await this.api.get(
      `/api/${context.sgbd}/${context.version}${path}${this.connectionContext.toQueryString(context)}`
    )

    if (!result?.success || !result?.data) {
      throw new Error(result?.error || result?.message || 'Could not load the diagram.')
    }

    return { diagram: result.data as DatabaseDiagram, context }
  }
}
