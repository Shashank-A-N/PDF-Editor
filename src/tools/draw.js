import { BaseTool } from './base-tool.js'
import { CURSORS, EVENTS } from '../constants.js'

export class DrawTool extends BaseTool {
  constructor(state, renderer, elements, eventBus) {
    super(state, renderer, elements, eventBus)
    this.cursor = CURSORS.CROSSHAIR
    this.drawing = false
    this.currentPath = null
    this.lastPoint = null
    this.smoothingBuffer = []
  }

  cleanup() {
    this.drawing = false
    this.currentPath = null
    this.lastPoint = null
    this.smoothingBuffer = []
  }

  onPointerDown(e) {
    const point = this.getPoint(e)
    this.drawing = true
    this.lastPoint = point

    const settings = this.state.toolSettings.draw

    this.currentPath = this.createObject('path', {
      points: [point],
      color: settings.color,
      size: settings.size,
      opacity: settings.opacity,
      smoothing: settings.smoothing
    })

    this.state.objects.push(this.currentPath)
    this.smoothingBuffer = [point]

    this.emit(EVENTS.OBJECT_ADDED, { object: this.currentPath })
  }

  onPointerMove(e) {
    if (!this.drawing || !this.currentPath) return

    const point = this.getPoint(e)
    const distance = this.getDistance(this.lastPoint, point)

    if (distance < 2) return

    this.smoothingBuffer.push(point)

    if (this.smoothingBuffer.length > 3) {
      this.smoothingBuffer.shift()
    }

    const smoothedPoint = this.getSmoothPoint()
    this.currentPath.points.push(smoothedPoint)
    this.lastPoint = smoothedPoint

    this.renderer.render()
  }

  onPointerUp(e) {
    if (!this.drawing) return

    this.drawing = false

    if (this.currentPath && this.currentPath.points.length < 2) {
      const index = this.state.objects.indexOf(this.currentPath)
      if (index >= 0) {
        this.state.objects.splice(index, 1)
      }
    } else {
      this.emit(EVENTS.OBJECT_UPDATED, { object: this.currentPath })
    }

    this.currentPath = null
    this.smoothingBuffer = []
    this.renderer.render()
  }

  getSmoothPoint() {
    if (this.smoothingBuffer.length === 1) {
      return this.smoothingBuffer[0]
    }

    let totalX = 0
    let totalY = 0

    for (const p of this.smoothingBuffer) {
      totalX += p.x
      totalY += p.y
    }

    return {
      x: totalX / this.smoothingBuffer.length,
      y: totalY / this.smoothingBuffer.length
    }
  }

  getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
  }
}