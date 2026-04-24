import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'
import { ConnectionsService, SavedConnection } from '../resolve-connections/connections.service'

@Injectable({
  providedIn: 'root'
})
export class ConnectionContextService {
  private ensuredContexts = new Map<string, string>()

  constructor(
    private IAPI: InternalApiService,
    private connectionsService: ConnectionsService
  ) { }

  createContext(schemaDb: any, forceNewKey: boolean = false): any {
    if (!schemaDb) return schemaDb

    return {
      ...schemaDb,
      connectionKey: forceNewKey
        ? this.createConnectionKey()
        : schemaDb.connectionKey || this.createConnectionKey()
    }
  }

  async ensureContext(schemaDb: any): Promise<any> {
    let context = this.createContext(schemaDb)

    if (!context?.sgbd && !context?.connId && !context?.connectionId) {
      throw new Error('No database connection selected for this tab.')
    }

    const connection = await this.resolveSavedConnection(context)
    context = this.enrichContextWithConnection(context, connection)

    if (!context?.sgbd || !context?.version) {
      throw new Error('No database connection selected for this tab.')
    }

    const stateKey = [
      context.connectionKey,
      connection.id,
      connection.host,
      connection.port,
      connection.user,
      context.sgbd,
      context.version,
      context.database,
      context.schema
    ].join(':')

    if (this.ensuredContexts.get(context.connectionKey) === stateKey) {
      return context
    }

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

  private async resolveSavedConnection(context: any): Promise<SavedConnection> {
    const connectionId = context.connId || context.connectionId
    if (connectionId) {
      return this.connectionsService.getConnectionById(connectionId)
    }

    const connections = await this.connectionsService.loadConnections()
    const matchedConnection = connections.find((connection) =>
      this.sameSavedConnection(connection, context)
    )

    if (!matchedConnection) {
      throw new Error('Selected connection was not found in saved connections.')
    }

    return matchedConnection
  }

  private sameSavedConnection(connection: SavedConnection, context: any): boolean {
    const sameDatabase = connection.database === context.sgbd
    const sameHost = !context.host || connection.host === context.host
    const samePort = !context.port || String(connection.port) === String(context.port)
    const sameName = !context.name || connection.name === context.name

    return sameDatabase && sameHost && samePort && sameName
  }

  private enrichContextWithConnection(context: any, connection: SavedConnection): any {
    return {
      ...context,
      connId: context.connId || context.connectionId || connection.id,
      name: context.name || connection.name,
      host: context.host || connection.host,
      port: context.port || connection.port,
      sgbd: context.sgbd || connection.database,
      version: context.version || connection.version
    }
  }
}
