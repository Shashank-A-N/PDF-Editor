import { BaseTool } from './base-tool.js'
import { CURSORS, EVENTS } from '../constants.js'

export class EraserTool extends BaseTool {
  constructor(state, renderer, elements, eventBus) {
    super(state, renderer, elements, eventBus)
    this.cursor = CURSORS.CROSSHAIR
    this.erasing = false
    this.eraserSize = 20
  }

  onPointerDown(e) {
    this.erasing = true
    this.erase(e)
  }

  onPointerMove(e) {
    if (!this.erasing) return
    this.erase(e)
  }

  onPointerUp(e) {
    this.erasing = false
  }

  erase(e) {
    const point = this.getPoint(e)
    const eraserRadius = this.eraserSize / 2

    const objectsToRemove = []

    for (const obj of this.state.objects) {
      if (obj.page !== this.state.view.page) continue

      if (obj.type === 'path') {
        obj.points = obj.points.filter(p => {
          const dist = Math.sqrt(Math.pow(p.x - point.x, 2) + Math.pow(p.y - point.y, 2))
          return dist > eraserRadius
        })

        if (obj.points.length < 2) {
          objectsToRemove.push(obj)
        }
      } else {
        const objCenter = {
          x: obj.x + (obj.width || 0) / 2,
          y: obj.y + (obj.height || 0) / 2
        }

        const dist = Math.sqrt(
          Math.pow(objCenter.x - point.x, 2) + 
          Math.pow(objCenter.y - point.y, 2)
        )

        if (dist < eraserRadius) {
          objectsToRemove.push(obj)
        }
      }
    }

    for (const obj of objectsToRemove) {
      const index = this.state.objects.indexOf(obj)
      if (index >= 0) {
        this.state.objects.splice(index, 1)
        this.emit(EVENTS.OBJECT_DELETED, { object: obj })
      }
    }

    if (objectsToRemove.length > 0) {
      this.renderer.render()
    }
  }

  setEraserSize(size) {
    this.eraserSize = size
  }
}