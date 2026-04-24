import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'
import { ConnectionsService } from '../resolve-connections/connections.service'

@Injectable({
  providedIn: 'root'
})
export class ConnectionContextService {
  private ensuredContexts = new Map<string, string>()

  constructor(
    private IAPI: InternalApiService,
    private connectionsService: ConnectionsService
  ) { }

  createContext(schemaDb: any): any {
    if (!schemaDb) return schemaDb

    return {
      ...schemaDb,
      connectionKey: schemaDb.connectionKey || this.createConnectionKey()
    }
  }

  async ensureContext(schemaDb: any): Promise<any> {
    const context = this.createContext(schemaDb)

    if (!context?.sgbd || !context?.version) {
      throw new Error('No database connection selected for this tab.')
    }

    const connectionId = context.connId || context.connectionId
    if (!connectionId) {
      throw new Error('Selected connection has no saved connection id.')
    }

    const stateKey = [
      context.connectionKey,
      context.sgbd,
      context.version,
      context.database,
      context.schema
    ].join(':')

    if (this.ensuredContexts.get(context.connectionKey) === stateKey) {
      return context
    }

    const connection = await this.connectionsService.getConnectionById(connectionId)

    await this.IAPI.post(`/api/${context.sgbd}/${context.version}/connect`, {
      host: connection.host,
      port: connection.port,
      user: connection.user,
      password: connection.password,
      connectionKey: context.connectionKey
    })

    if (context.database || context.schema) {
      await this.IAPI.post(`/api/${context.sgbd}/${context.version}/set-schema`, {
        database: context.database,
        schema: context.schema,
        connectionKey: context.connectionKey
      })
    }

    this.ensuredContexts.set(context.connectionKey, stateKey)
    return context
  }

  toQueryString(schemaDb: any): string {
    return schemaDb?.connectionKey
      ? `?connectionKey=${encodeURIComponent(schemaDb.connectionKey)}`
      : ''
  }

  withoutRuntimeFields(schemaDb: any): any {
    if (!schemaDb) return schemaDb

    const { connectionKey, ...persistableSchemaDb } = schemaDb
    return persistableSchemaDb
  }

  private createConnectionKey(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}
