import { BaseTool } from './base-tool.js'
import { CURSORS, EVENTS, FORM_FIELD_TYPES } from '../constants.js'

export class FormTool extends BaseTool {
  constructor(state, renderer, elements, eventBus) {
    super(state, renderer, elements, eventBus)
    this.cursor = CURSORS.CROSSHAIR
    this.fieldType = FORM_FIELD_TYPES.TEXT_INPUT
  }

  onPointerDown(e) {
    const point = this.snapToGrid(this.getPoint(e))
    
    const formField = this.createObject('form-field', {
      fieldType: this.fieldType,
      x: point.x,
      y: point.y,
      width: 200,
      height: 30,
      label: 'Form Field',
      value: '',
      required: false,
      placeholder: '',
      options: []
    })

    this.state.formFields.push(formField)
    this.state.objects.push(formField)
    this.state.selection = [formField]

    this.emit(EVENTS.OBJECT_ADDED, { object: formField })
    this.emit(EVENTS.SELECTION_CHANGED, { selection: [formField] })

    this.renderer.render()
  }

  setFieldType(type) {
    this.fieldType = type
  }
}