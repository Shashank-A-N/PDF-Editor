import { BaseTool } from './base-tool.js'
import { CURSORS, EVENTS } from '../constants.js'

export class ShapeTool extends BaseTool {
  constructor(state, renderer, elements, eventBus, shapeType) {
    super(state, renderer, elements, eventBus)
    this.shapeType = shapeType
    this.cursor = CURSORS.CROSSHAIR
    this.drawing = false
    this.currentShape = null
    this.startPoint = null
  }

  cleanup() {
    this.drawing = false
    this.currentShape = null
  }

  onPointerDown(e) {
    const point = this.snapToGrid(this.getPoint(e))
    this.drawing = true
    this.startPoint = point

    const settings = this.state.toolSettings.shape

    this.currentShape = this.createObject(this.shapeType, {
      x: point.x,
      y: point.y,
      width: 1,
      height: 1,
      stroke: settings.stroke,
      strokeWidth: settings.strokeWidth,
      fill: settings.fill,
      opacity: settings.opacity,
      lineCap: 'round',
      lineJoin: 'round'
    })

    this.state.objects.push(this.currentShape)
    this.emit(EVENTS.OBJECT_ADDED, { object: this.currentShape })
  }

  onPointerMove(e) {
    if (!this.drawing || !this.currentShape) return

    const point = this.snapToGrid(this.getPoint(e))
    
    let width = point.x - this.startPoint.x
    let height = point.y - this.startPoint.y

    if (e.shiftKey) {
      if (this.shapeType === 'oval' || this.shapeType === 'rect') {
        const size = Math.max(Math.abs(width), Math.abs(height))
        width = width < 0 ? -size : size
        height = height < 0 ? -size : size
      } else if (this.shapeType === 'line') {
        if (Math.abs(width) > Math.abs(height)) {
          height = 0
        } else {
          width = 0
        }
      }
    }

    this.currentShape.width = width
    this.currentShape.height = height

    this.renderer.render()
  }

  onPointerUp(e) {
    if (!this.drawing) return

    this.drawing = false

    if (this.currentShape) {
      if (Math.abs(this.currentShape.width) < 5 && Math.abs(this.currentShape.height) < 5) {
        const index = this.state.objects.indexOf(this.currentShape)
        if (index >= 0) {
          this.state.objects.splice(index, 1)
        }
      } else {
        if (this.currentShape.width < 0) {
          this.currentShape.x += this.currentShape.width
          this.currentShape.width = Math.abs(this.currentShape.width)
        }
        if (this.currentShape.height < 0) {
          this.currentShape.y += this.currentShape.height
          this.currentShape.height = Math.abs(this.currentShape.height)
        }

        this.state.selection = [this.currentShape]
        this.emit(EVENTS.OBJECT_UPDATED, { object: this.currentShape })
        this.emit(EVENTS.SELECTION_CHANGED, { selection: [this.currentShape] })
      }
    }

    this.currentShape = null
    this.renderer.render()
  }
}