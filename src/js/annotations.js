/**
 * Blueprint Annotation System
 * Technical SVG lines connecting 3D guitar parts to DOM labels
 */

export class BlueprintAnnotations {
  constructor(scene, camera, guitar) {
    this.scene = scene
    this.camera = camera
    this.guitar = guitar
    this.annotations = []
    this.svgLayer = null
    this.enabled = true

    this.initSVGLayer()
    this.defineAnnotations()
  }

  /**
   * Create SVG overlay layer
   */
  initSVGLayer() {
    // Create SVG element overlay
    this.svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.svgLayer.id = 'blueprint-annotations'
    this.svgLayer.style.position = 'fixed'
    this.svgLayer.style.top = '0'
    this.svgLayer.style.right = '0'
    this.svgLayer.style.width = '50vw'
    this.svgLayer.style.height = '100vh'
    this.svgLayer.style.pointerEvents = 'none'
    this.svgLayer.style.zIndex = '10'
    
    document.body.appendChild(this.svgLayer)
  }

  /**
   * Define annotation points on the guitar
   * Each annotation has a 3D position and a label
   */
  defineAnnotations() {
    this.annotations = [
      {
        id: 'strings',
        position: new THREE.Vector3(0, 0.3, 0.5),
        label: 'STRINGS',
        description: '6 strings, E-A-D-G-B-e',
        visible: true
      },
      {
        id: 'frets',
        position: new THREE.Vector3(-0.15, 0.3, -0.3),
        label: 'FRETS',
        description: '12 fret positions',
        visible: true
      },
      {
        id: 'body',
        position: new THREE.Vector3(0, 0, 1.2),
        label: 'BODY',
        description: 'Resonance chamber',
        visible: true
      },
      {
        id: 'headstock',
        position: new THREE.Vector3(0, 0.5, -1.2),
        label: 'HEADSTOCK',
        description: 'Tuning mechanism',
        visible: true
      }
    ]
  }

  /**
   * Update annotation positions and draw lines
   * Called on every render frame or camera change
   */
  update() {
    if (!this.enabled || !this.guitar || !this.svgLayer) return

    // Clear previous SVG content
    while (this.svgLayer.firstChild) {
      this.svgLayer.removeChild(this.svgLayer.firstChild)
    }

    const rect = this.svgLayer.getBoundingClientRect()
    const halfWidth = rect.width / 2
    const halfHeight = rect.height / 2

    this.annotations.forEach((annotation, index) => {
      if (!annotation.visible) return

      // Convert 3D position to 2D screen coordinates
      const pos3D = annotation.position.clone()
      pos3D.applyMatrix4(this.guitar.matrixWorld)
      
      const projected = pos3D.project(this.camera)
      
      // Convert to SVG coordinates (right half of screen only)
      const x3D = (projected.x * halfWidth) + halfWidth
      const y3D = -(projected.y * halfHeight) + halfHeight

      // Check if point is in front of camera
      if (projected.z > 1) return

      // Calculate label position (right side of canvas with offset)
      const labelX = rect.width - 120
      const labelY = 80 + (index * 80)

      // Draw technical line from 3D point to label
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', x3D)
      line.setAttribute('y1', y3D)
      line.setAttribute('x2', labelX - 10)
      line.setAttribute('y2', labelY)
      line.setAttribute('stroke', '#E5E5E5')
      line.setAttribute('stroke-width', '1')
      line.setAttribute('stroke-dasharray', '2,2')
      this.svgLayer.appendChild(line)

      // Draw small circle at 3D point
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('cx', x3D)
      circle.setAttribute('cy', y3D)
      circle.setAttribute('r', '3')
      circle.setAttribute('fill', '#2563EB')
      circle.setAttribute('opacity', '0.6')
      this.svgLayer.appendChild(circle)

      // Create label group
      const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')

      // Label background (optional - for better readability)
      const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      labelBg.setAttribute('x', labelX - 5)
      labelBg.setAttribute('y', labelY - 18)
      labelBg.setAttribute('width', '110')
      labelBg.setAttribute('height', '50')
      labelBg.setAttribute('fill', '#FFFFFF')
      labelBg.setAttribute('opacity', '0.9')
      labelBg.setAttribute('stroke', '#E5E5E5')
      labelBg.setAttribute('stroke-width', '1')
      labelGroup.appendChild(labelBg)

      // Main label text
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', labelX)
      text.setAttribute('y', labelY)
      text.setAttribute('font-family', 'Inter, sans-serif')
      text.setAttribute('font-size', '11')
      text.setAttribute('font-weight', '600')
      text.setAttribute('fill', '#111111')
      text.setAttribute('letter-spacing', '0.5')
      text.textContent = annotation.label
      labelGroup.appendChild(text)

      // Description text
      const desc = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      desc.setAttribute('x', labelX)
      desc.setAttribute('y', labelY + 14)
      desc.setAttribute('font-family', 'Inter, sans-serif')
      desc.setAttribute('font-size', '9')
      desc.setAttribute('fill', '#9CA3AF')
      desc.textContent = annotation.description
      labelGroup.appendChild(desc)

      this.svgLayer.appendChild(labelGroup)
    })
  }

  /**
   * Toggle annotation visibility
   */
  setEnabled(enabled) {
    this.enabled = enabled
    if (this.svgLayer) {
      this.svgLayer.style.display = enabled ? 'block' : 'none'
    }
  }

  /**
   * Update specific annotation visibility
   */
  setAnnotationVisible(id, visible) {
    const annotation = this.annotations.find(a => a.id === id)
    if (annotation) {
      annotation.visible = visible
    }
  }

  /**
   * Add custom annotation dynamically
   */
  addAnnotation(id, position, label, description) {
    this.annotations.push({
      id,
      position,
      label,
      description,
      visible: true
    })
  }

  /**
   * Clean up
   */
  dispose() {
    if (this.svgLayer && this.svgLayer.parentNode) {
      this.svgLayer.parentNode.removeChild(this.svgLayer)
    }
    this.annotations = []
  }
}
