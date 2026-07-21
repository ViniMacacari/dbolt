import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild
} from '@angular/core'
import { CommonModule } from '@angular/common'
import {
  DatabaseDiagram,
  DatabaseDiagramService,
  DiagramEntity,
  DiagramRelation,
  DiagramRequest
} from '../../../services/diagram/database-diagram.service'
import { AppLanguageService } from '../../../services/language/app-language.service'

interface PositionedEntity extends DiagramEntity {
  x: number
  y: number
  width: number
  height: number
}

type EntityInteractionMode = 'move' | 'resize'

interface EntityInteraction {
  mode: EntityInteractionMode
  entity: PositionedEntity
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

@Component({
  selector: 'app-database-diagram',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './database-diagram.component.html',
  styleUrl: './database-diagram.component.scss'
})
export class DatabaseDiagramComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @Input() tabInfo: any
  @ViewChild('viewport') viewport?: ElementRef<HTMLDivElement>

  diagram: DatabaseDiagram | null = null
  entities: PositionedEntity[] = []
  relations: DiagramRelation[] = []
  loading = false
  errorMessage = ''
  zoom = 1
  maximized = false
  canvasWidth = 900
  canvasHeight = 560
  panning = false
  selectedRelation: DiagramRelation | null = null
  activeEntityId: string | null = null

  private readonly entityWidth = 264
  private readonly headerHeight = 38
  private readonly rowHeight = 28
  private readonly horizontalGap = 150
  private readonly verticalGap = 70
  private requestId = 0
  private panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 }
  private fitTimeout?: ReturnType<typeof setTimeout>
  private entityInteraction: EntityInteraction | null = null

  constructor(
    private diagramService: DatabaseDiagramService,
    private language: AppLanguageService
  ) { }

  ngOnInit(): void {
    this.restoreState()
    void this.loadDiagram()
  }

  ngAfterViewInit(): void {
    this.queueFit(false)
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tabInfo'] && !changes['tabInfo'].firstChange) {
      this.restoreState()
      void this.loadDiagram()
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.fitTimeout)
    this.persistState()
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.maximized) this.toggleMaximized()
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.diagram?.scope === 'object') this.queueFit(false)
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(event: PointerEvent): void {
    const interaction = this.entityInteraction
    if (!interaction) return

    const deltaX = (event.clientX - interaction.startClientX) / this.zoom
    const deltaY = (event.clientY - interaction.startClientY) / this.zoom
    if (interaction.mode === 'move') {
      interaction.entity.x = Math.max(14, Math.round(interaction.startX + deltaX))
      interaction.entity.y = Math.max(14, Math.round(interaction.startY + deltaY))
    } else {
      interaction.entity.width = Math.max(190, Math.min(820, Math.round(interaction.startWidth + deltaX)))
      interaction.entity.height = Math.max(94, Math.min(1200, Math.round(interaction.startHeight + deltaY)))
    }

    this.updateCanvasBounds()
    event.preventDefault()
  }

  @HostListener('document:pointerup', ['$event'])
  @HostListener('document:pointercancel', ['$event'])
  onDocumentPointerEnd(event: PointerEvent): void {
    if (!this.entityInteraction) return

    this.entityInteraction = null
    this.activeEntityId = null
    this.persistState()
    event.preventDefault()
  }

  async loadDiagram(force = false): Promise<void> {
    const request = this.getRequest()
    if (!request?.context) {
      this.errorMessage = this.t('diagram.noContext')
      return
    }

    if (!force && this.tabInfo?.diagramData) {
      this.applyDiagram(this.tabInfo.diagramData)
      return
    }

    const requestId = ++this.requestId
    this.loading = true
    this.errorMessage = ''

    try {
      const result = await this.diagramService.load(request)
      if (requestId !== this.requestId) return

      this.tabInfo.dbInfo = result.context
      this.tabInfo.info = { ...this.tabInfo.info, context: result.context }
      this.tabInfo.diagramData = result.diagram
      this.applyDiagram(result.diagram)
    } catch (error: any) {
      if (requestId !== this.requestId) return
      this.diagram = null
      this.entities = []
      this.relations = []
      this.errorMessage = error?.error || error?.message || this.t('diagram.loadError')
    } finally {
      if (requestId === this.requestId) this.loading = false
    }
  }

  zoomIn(): void {
    this.setZoom(this.zoom + 0.1)
  }

  zoomOut(): void {
    this.setZoom(this.zoom - 0.1)
  }

  resetZoom(): void {
    this.setZoom(1)
  }

  resetLayout(): void {
    if (!this.diagram) return

    const state = this.tabInfo?.diagramState || {}
    this.tabInfo.diagramState = { ...state, layout: {} }
    this.layoutEntities(this.orderEntities(this.diagram.entities || [], this.relations))
    this.persistState()
    this.queueFit(true)
  }

  fitToScreen(): void {
    const viewport = this.viewport?.nativeElement
    if (!viewport || this.entities.length === 0) return

    const horizontal = Math.max(0.35, (viewport.clientWidth - 48) / this.canvasWidth)
    const vertical = Math.max(0.35, (viewport.clientHeight - 48) / this.canvasHeight)
    this.setZoom(Math.min(1.5, horizontal, vertical))
    setTimeout(() => {
      viewport.scrollLeft = 0
      viewport.scrollTop = 0
    })
  }

  toggleMaximized(): void {
    this.maximized = !this.maximized
    this.persistState()
    this.queueFit(false)
  }

  onViewportDoubleClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.diagram-entity, .diagram-relation-info')) return
    this.toggleMaximized()
  }

  startPan(event: PointerEvent): void {
    const target = event.target as HTMLElement
    if (
      event.button !== 0 ||
      target.closest('.diagram-controls, .diagram-entity, .diagram-relation-hit, .diagram-relation-info')
    ) return
    const viewport = this.viewport?.nativeElement
    if (!viewport) return

    this.clearSelectedRelation()
    this.panning = true
    this.panStart = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop
    }
    viewport.setPointerCapture(event.pointerId)
  }

  pan(event: PointerEvent): void {
    const viewport = this.viewport?.nativeElement
    if (!this.panning || !viewport) return

    viewport.scrollLeft = this.panStart.scrollLeft - (event.clientX - this.panStart.x)
    viewport.scrollTop = this.panStart.scrollTop - (event.clientY - this.panStart.y)
  }

  endPan(event: PointerEvent): void {
    if (!this.panning) return
    this.panning = false
    const viewport = this.viewport?.nativeElement
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
  }

  startEntityInteraction(
    event: PointerEvent,
    entity: PositionedEntity,
    mode: EntityInteractionMode
  ): void {
    if (event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()
    this.clearSelectedRelation()
    this.activeEntityId = entity.id
    this.entityInteraction = {
      mode,
      entity,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: entity.x,
      startY: entity.y,
      startWidth: entity.width,
      startHeight: entity.height
    }
  }

  selectRelation(event: MouseEvent, relation: DiagramRelation): void {
    event.preventDefault()
    event.stopPropagation()
    this.selectedRelation = relation
    this.persistState()
  }

  clearSelectedRelation(): void {
    if (!this.selectedRelation) return
    this.selectedRelation = null
    this.persistState()
  }

  isSelectedRelation(relation: DiagramRelation): boolean {
    return this.selectedRelation?.id === relation.id
  }

  isRelatedEntity(entity: PositionedEntity, endpoint: 'source' | 'target'): boolean {
    if (!this.selectedRelation) return false
    const relationEntity = endpoint === 'source'
      ? this.selectedRelation.sourceEntity
      : this.selectedRelation.targetEntity
    return entity.id === relationEntity || entity.name === relationEntity
  }

  relationPath(relation: DiagramRelation): string {
    const source = this.entities.find((entity) => entity.id === relation.sourceEntity || entity.name === relation.sourceEntity)
    const target = this.entities.find((entity) => entity.id === relation.targetEntity || entity.name === relation.targetEntity)
    if (!source || !target) return ''

    const sourceRow = Math.max(0, source.columns.findIndex((column) => column.name === relation.sourceColumn))
    const targetRow = Math.max(0, target.columns.findIndex((column) => column.name === relation.targetColumn))
    const targetIsRight = target.x >= source.x
    const sourceX = targetIsRight ? source.x + source.width : source.x
    const targetX = targetIsRight ? target.x : target.x + target.width
    const sourceY = this.clampRelationY(source, sourceRow)
    const targetY = this.clampRelationY(target, targetRow)
    const bend = Math.max(46, Math.abs(targetX - sourceX) * 0.42)
    const controlSourceX = sourceX + (targetIsRight ? bend : -bend)
    const controlTargetX = targetX + (targetIsRight ? -bend : bend)

    return `M ${sourceX} ${sourceY} C ${controlSourceX} ${sourceY}, ${controlTargetX} ${targetY}, ${targetX} ${targetY}`
  }

  trackEntity(_index: number, entity: PositionedEntity): string {
    return entity.id
  }

  trackColumn(_index: number, column: any): string {
    return column.name
  }

  trackRelation(_index: number, relation: DiagramRelation): string {
    return relation.id
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.language.translate(key, params)
  }

  private getRequest(): DiagramRequest | null {
    const info = this.tabInfo?.info || {}
    if (!info.scope) return null

    return {
      scope: info.scope,
      context: info.context || this.tabInfo?.dbInfo,
      objectName: info.objectName,
      objectType: info.objectType
    }
  }

  private applyDiagram(diagram: DatabaseDiagram): void {
    this.diagram = diagram
    this.errorMessage = ''
    const entityNames = new Set((diagram.entities || []).flatMap((entity) => [entity.id, entity.name]))
    this.relations = (diagram.relations || []).filter((relation) =>
      entityNames.has(relation.sourceEntity) && entityNames.has(relation.targetEntity)
    )
    this.layoutEntities(this.orderEntities(diagram.entities || [], this.relations))
    const selectedRelationId = this.tabInfo?.diagramState?.selectedRelationId
    this.selectedRelation = this.relations.find((relation) => relation.id === selectedRelationId) || null
    this.queueFit(diagram.scope === 'object')
  }

  private orderEntities(entities: DiagramEntity[], relations: DiagramRelation[]): DiagramEntity[] {
    if (entities.length < 3 || relations.length === 0) return entities

    const byName = new Map<string, DiagramEntity>()
    entities.forEach((entity) => {
      byName.set(entity.id, entity)
      byName.set(entity.name, entity)
    })
    const adjacency = new Map<string, Set<string>>()
    entities.forEach((entity) => adjacency.set(entity.id, new Set<string>()))
    relations.forEach((relation) => {
      const source = byName.get(relation.sourceEntity)
      const target = byName.get(relation.targetEntity)
      if (!source || !target || source.id === target.id) return
      adjacency.get(source.id)?.add(target.id)
      adjacency.get(target.id)?.add(source.id)
    })

    const pending = new Set(entities.map((entity) => entity.id))
    const ordered: DiagramEntity[] = []
    while (pending.size) {
      const root = [...pending]
        .map((id) => byName.get(id))
        .filter((entity): entity is DiagramEntity => Boolean(entity))
        .sort((left, right) =>
          (adjacency.get(right.id)?.size || 0) - (adjacency.get(left.id)?.size || 0) ||
          left.name.localeCompare(right.name)
        )[0]
      if (!root) break

      const queue = [root.id]
      pending.delete(root.id)
      while (queue.length) {
        const currentId = queue.shift()!
        const current = byName.get(currentId)
        if (current) ordered.push(current)
        const neighbors = [...(adjacency.get(currentId) || [])]
          .filter((id) => pending.has(id))
          .sort((left, right) => (adjacency.get(right)?.size || 0) - (adjacency.get(left)?.size || 0))
        neighbors.forEach((neighbor) => {
          pending.delete(neighbor)
          queue.push(neighbor)
        })
      }
    }

    return ordered
  }

  private layoutEntities(entities: DiagramEntity[]): void {
    if (!entities.length) {
      this.entities = []
      this.canvasWidth = 900
      this.canvasHeight = 560
      return
    }

    const columnsPerRow = Math.max(1, Math.ceil(Math.sqrt(entities.length * 1.45)))
    const rowHeights: number[] = []
    entities.forEach((entity, index) => {
      const row = Math.floor(index / columnsPerRow)
      const height = this.headerHeight + Math.max(1, entity.columns.length) * this.rowHeight
      rowHeights[row] = Math.max(rowHeights[row] || 0, height)
    })
    const rowOffsets = rowHeights.map((_height, index) =>
      34 + rowHeights.slice(0, index).reduce((sum, height) => sum + height + this.verticalGap, 0)
    )

    this.entities = entities.map((entity, index) => {
      const row = Math.floor(index / columnsPerRow)
      const column = index % columnsPerRow
      const height = this.headerHeight + Math.max(1, entity.columns.length) * this.rowHeight
      const savedLayout = this.tabInfo?.diagramState?.layout?.[entity.id]
      return {
        ...entity,
        x: this.layoutNumber(savedLayout?.x, 34 + column * (this.entityWidth + this.horizontalGap), 14),
        y: this.layoutNumber(savedLayout?.y, rowOffsets[row], 14),
        width: this.layoutNumber(savedLayout?.width, this.entityWidth, 190),
        height: this.layoutNumber(savedLayout?.height, height, 94)
      }
    })
    this.updateCanvasBounds()
  }

  private setZoom(value: number): void {
    this.zoom = Math.min(1.8, Math.max(0.35, Math.round(value * 10) / 10))
    this.persistState()
  }

  private queueFit(force: boolean): void {
    clearTimeout(this.fitTimeout)
    this.fitTimeout = setTimeout(() => {
      if (force || !this.tabInfo?.diagramState?.zoom) this.fitToScreen()
    })
  }

  private restoreState(): void {
    const state = this.tabInfo?.diagramState
    this.zoom = Number(state?.zoom) || 1
    this.maximized = Boolean(state?.maximized)
  }

  private persistState(): void {
    if (!this.tabInfo) return
    const layout = Object.fromEntries(this.entities.map((entity) => [entity.id, {
      x: entity.x,
      y: entity.y,
      width: entity.width,
      height: entity.height
    }]))
    this.tabInfo.diagramState = {
      ...(this.tabInfo.diagramState || {}),
      zoom: this.zoom,
      maximized: this.maximized,
      selectedRelationId: this.selectedRelation?.id || null,
      layout
    }
  }

  private updateCanvasBounds(): void {
    this.canvasWidth = Math.max(760, ...this.entities.map((entity) => entity.x + entity.width + 64))
    this.canvasHeight = Math.max(500, ...this.entities.map((entity) => entity.y + entity.height + 64))
  }

  private clampRelationY(entity: PositionedEntity, rowIndex: number): number {
    const ideal = entity.y + this.headerHeight + rowIndex * this.rowHeight + this.rowHeight / 2
    const minimum = entity.y + this.headerHeight + 14
    const maximum = entity.y + entity.height - 14
    return Math.min(Math.max(ideal, minimum), Math.max(minimum, maximum))
  }

  private layoutNumber(value: any, fallback: number, minimum: number): number {
    const normalized = Number(value)
    return Number.isFinite(normalized) ? Math.max(minimum, normalized) : fallback
  }
}
