import { CONFIG, EVENTS } from '../constants.js'

export class History {
  constructor(state, eventBus) {
    this.state = state
    this.eventBus = eventBus
    this.stack = []
    this.index = -1
    this.limit = CONFIG.HISTORY_SIZE
    this.isRestoring = false
    this.lastSnapshot = null
  }
  
  snapshot() {
    if (this.isRestoring) return
    
    const snapshot = {
      objects: JSON.parse(JSON.stringify(this.state.objects)),
      layers: JSON.parse(JSON.stringify(this.state.layers)),
      bookmarks: JSON.parse(JSON.stringify(this.state.bookmarks)),
      backgrounds: Array.from(this.state.document.backgrounds.entries()),
      page: this.state.view.page,
      timestamp: Date.now()
    }
    
    const snapshotStr = JSON.stringify(snapshot)
    
    if (snapshotStr === this.lastSnapshot) {
      return
    }
    
    this.lastSnapshot = snapshotStr
    
    return snapshot
  }
  
  checkpoint(description = '') {
    const snapshot = this.snapshot()
    if (!snapshot) return
    
    snapshot.description = description
    
    this.stack = this.stack.slice(0, this.index + 1)
    this.stack.push(snapshot)
    this.index++
    
    if (this.stack.length > this.limit) {
      this.stack.shift()
      this.index--
    }
    
    this.state.flags.dirty = true
    
    if (this.eventBus) {
      this.eventBus.emit(EVENTS.HISTORY_CHANGED, {
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        stackSize: this.stack.length,
        index: this.index
      })
    }
  }
  
  restore(snapshot) {
    this.isRestoring = true
    
    this.state.objects = JSON.parse(JSON.stringify(snapshot.objects))
    this.state.layers = JSON.parse(JSON.stringify(snapshot.layers))
    this.state.bookmarks = JSON.parse(JSON.stringify(snapshot.bookmarks))
    this.state.document.backgrounds = new Map(snapshot.backgrounds)
    this.state.view.page = snapshot.page
    this.state.selection = []
    
    this.lastSnapshot = JSON.stringify(snapshot)
    
    this.isRestoring = false
  }
  
  undo() {
    if (!this.canUndo()) return false
    
    this.index--
    const snapshot = this.stack[this.index]
    this.restore(snapshot)
    
    if (this.eventBus) {
      this.eventBus.emit(EVENTS.HISTORY_CHANGED, {
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        action: 'undo',
        description: snapshot.description
      })
    }
    
    return true
  }
  
  redo() {
    if (!this.canRedo()) return false
    
    this.index++
    const snapshot = this.stack[this.index]
    this.restore(snapshot)
    
    if (this.eventBus) {
      this.eventBus.emit(EVENTS.HISTORY_CHANGED, {
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        action: 'redo',
        description: snapshot.description
      })
    }
    
    return true
  }
  
  canUndo() {
    return this.index > 0
  }
  
  canRedo() {
    return this.index < this.stack.length - 1
  }
  
  clear() {
    this.stack = []
    this.index = -1
    this.lastSnapshot = null
    
    if (this.eventBus) {
      this.eventBus.emit(EVENTS.HISTORY_CHANGED, {
        canUndo: false,
        canRedo: false,
        stackSize: 0,
        index: -1
      })
    }
  }
  
  getHistory() {
    return {
      stack: this.stack.map(s => ({
        description: s.description,
        timestamp: s.timestamp
      })),
      index: this.index,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    }
  }
}