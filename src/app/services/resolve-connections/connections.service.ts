import { Injectable } from '@angular/core'
import { InternalApiService } from '../requests/internal-api.service'
import { CacheManagerService } from '../cache/cache-manager.service'

export interface SavedConnection {
  id: number
  name: string
  database: string
  version: string
  host: string
  port: string | number
  user: string
  password: string
}

export type NewConnection = Omit<SavedConnection, 'id'>

interface SaveConnectionResponse {
  success: boolean
  message?: string
  data?: SavedConnection
}

@Injectable({
  providedIn: 'root'
})
export class ConnectionsService {
  private readonly connectionsCacheKey = 'saved-connections'
  private connectionsLoaded = false

  constructor(
    private IAPI: InternalApiService,
    private cache: CacheManagerService
  ) { }

  async loadConnections(forceRefresh = false): Promise<SavedConnection[]> {
    if (!forceRefresh && this.connectionsLoaded) {
      return this.getCachedConnections()
    }

    const connections = await this.IAPI.get<SavedConnection[]>('/api/connections/load')
    this.cache.set(this.connectionsCacheKey, connections)
    this.connectionsLoaded = true

    return this.getCachedConnections()
  }

  getCachedConnections(): SavedConnection[] {
    return [...(this.cache.get<SavedConnection[]>(this.connectionsCacheKey) || [])]
  }

  async getConnectionById(id: number): Promise<SavedConnection> {
    const cachedConnection = this.getCachedConnections().find((connection) => connection.id === id)

    if (cachedConnection) {
      return cachedConnection
    }

    const connection = await this.IAPI.get<SavedConnection>(`/api/connections/${id}`)
    this.upsertConnection(connection)

    return connection
  }

  async createConnection(connection: NewConnection): Promise<SavedConnection> {
    const response = await this.IAPI.post<SaveConnectionResponse>('/api/connections/new', connection)

    if (response.data) {
      this.upsertConnection(response.data)
      return response.data
    }

    const refreshedConnections = await this.loadConnections(true)
    const createdConnection = refreshedConnections.find((cachedConnection) =>
      cachedConnection.name === connection.name &&
      cachedConnection.host === connection.host &&
      String(cachedConnection.port) === String(connection.port)
    )

    if (!createdConnection) {
      throw new Error(response.message || 'Connection was saved, but could not be cached')
    }

    return createdConnection
  }

  async deleteConnection(id: number): Promise<void> {
    await this.IAPI.delete(`/api/connections/${id}`)
    this.removeConnection(id)
  }

  upsertConnection(connection: SavedConnection): SavedConnection[] {
    return this.cache.update<SavedConnection[]>(this.connectionsCacheKey, (connections = []) => {
      const existingConnectionIndex = connections.findIndex((item) => item.id === connection.id)

      if (existingConnectionIndex === -1) {
        return [...connections, connection]
      }

      return connections.map((item, index) => index === existingConnectionIndex ? connection : item)
    })
  }

  removeConnection(id: number): SavedConnection[] {
    return this.cache.update<SavedConnection[]>(this.connectionsCacheKey, (connections = []) =>
      connections.filter((connection) => connection.id !== id)
    )
  }
}
