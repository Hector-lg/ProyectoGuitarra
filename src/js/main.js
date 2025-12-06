/**
 * Main Entry Point - Guitarra Interactiva 3D
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Registrar plugin de GSAP
gsap.registerPlugin(ScrollTrigger)

// ========================================
// Variables globales
// ========================================
let scene, camera, renderer, controls
let guitar = null
let audioContext = null
let stringBuffers = {}  // Buffers para cada cuerda
let hitEffects = []     // Efectos visuales activos
let scaleMarkers = []   // Marcadores de escala en el mástil
let isPlayingScale = false  // Estado de reproducción de escala

const canvas = document.getElementById('guitar-canvas')
const loadingScreen = document.getElementById('loading-screen')
const loaderProgress = document.querySelector('.loader-progress')

// Nombres de las cuerdas (de grave a agudo)
const STRING_FILES = [
  { name: '6', file: '/sounds/6String_E.m4a' },
  { name: '5', file: '/sounds/5String_A.m4a' },
  { name: '4', file: '/sounds/4String_D.m4a' },
  { name: '3', file: '/sounds/3String_G.m4a' },
  { name: '2', file: '/sounds/2String_B.m4a' },
  { name: '1', file: '/sounds/1String_e.m4a' }
]

// ========================================
// Sistema de Audio
// ========================================
async function initAudio() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)()

  // Cargar todos los samples de cuerdas
  for (const string of STRING_FILES) {
    try {
      const response = await fetch(string.file)
      const arrayBuffer = await response.arrayBuffer()
      stringBuffers[string.name] = await audioContext.decodeAudioData(arrayBuffer)
      console.log(`Cuerda ${string.name} cargada`)
    } catch (error) {
      console.error(`Error cargando cuerda ${string.name}:`, error)
    }
  }
  console.log('Todos los audios cargados')
}

function playString(stringNumber) {
  if (!audioContext || !stringBuffers[stringNumber]) {
    console.log('Audio no disponible para cuerda', stringNumber)
    return
  }

  // Reanudar contexto si está suspendido
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }

  const source = audioContext.createBufferSource()
  source.buffer = stringBuffers[stringNumber]

  const gainNode = audioContext.createGain()
  gainNode.gain.value = 0.8

  source.connect(gainNode)
  gainNode.connect(audioContext.destination)

  source.start(0)
}

// ========================================
// Líneas Visuales de las Cuerdas
// ========================================
function createStringVisualGuides() {
  if (!guitar) return

  // Crear líneas para cada una de las 6 cuerdas
  // Las cuerdas están espaciadas uniformemente (más juntas)
  // Las 3 últimas (agudas) están ligeramente ajustadas
  const stringPositions = [-0.14, -0.092, -0.044, 0.024, 0.072, 0.12]
  const lineLength = 2.5  // Longitud aproximada de la guitarra
  
  stringPositions.forEach((yPos, index) => {
    // Crear geometría de línea vertical (más adelante en Z para que esté sobre las cuerdas)
    const points = []
    points.push(new THREE.Vector3(yPos, 0.30, -lineLength / 2))
    points.push(new THREE.Vector3(yPos, 0.30, lineLength / 2))
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    
    // Material con brillo dorado sutil y transparencia
    const material = new THREE.LineBasicMaterial({
      color: 0xd4af37,  // Color dorado
      transparent: true,
      opacity: 0.3,     // Transparente pero visible
      linewidth: 2
    })
    
    const line = new THREE.Line(geometry, material)
    
    // Agregar la línea al grupo de la guitarra para que rote con ella
    guitar.add(line)
    
    // Hacer que la línea se ilumine al pasar el mouse
    line.userData.stringNumber = (6 - index).toString()
    line.userData.isStringGuide = true
  })
  
  console.log('Líneas visuales de cuerdas creadas')
}

// ========================================
// Sistema de Escalas Musicales
// ========================================

// Definición de escalas (intervalos en semitonos desde la tónica)
const SCALES = {
  'major': [0, 2, 4, 5, 7, 9, 11, 12],  // Do Mayor: C D E F G A B C
  'minor': [0, 2, 3, 5, 7, 8, 10, 12],
  'pentatonic-major': [0, 2, 4, 7, 9, 12],
  'pentatonic-minor': [0, 3, 5, 7, 10, 12],
  'blues': [0, 3, 5, 6, 7, 10, 12]
}

// Posiciones de notas en el mástil para escala de Do Mayor (C)
// Formato: { string: número de cuerda (1-6), fret: número de traste (0-12) }
const C_MAJOR_POSITIONS = [
  { string: 6, fret: 8, note: 'C' },   // Cuerda 6, traste 8 = Do
  { string: 6, fret: 10, note: 'D' },  // Re
  { string: 5, fret: 7, note: 'E' },   // Mi
  { string: 5, fret: 8, note: 'F' },   // Fa
  { string: 5, fret: 10, note: 'G' },  // Sol
  { string: 4, fret: 7, note: 'A' },   // La
  { string: 4, fret: 9, note: 'B' },   // Si
  { string: 4, fret: 10, note: 'C' }   // Do octava
]

// Crear marcadores visuales de la escala
function createScaleMarkers() {
  // Limpiar marcadores anteriores
  clearScaleMarkers()

  if (!guitar) return

  const positions = C_MAJOR_POSITIONS

  positions.forEach((pos, index) => {
    // Calcular posición en el mástil
    const stringPos = getStringPosition(pos.string)
    const fretPos = getFretPosition(pos.fret)

    // Crear esfera para el marcador
    const geometry = new THREE.SphereGeometry(0.03, 16, 16)
    const material = new THREE.MeshStandardMaterial({
      color: 0xd4af37,  // Dorado
      emissive: 0x000000,
      metalness: 0.5,
      roughness: 0.3,
      transparent: true,
      opacity: 0.6
    })

    const marker = new THREE.Mesh(geometry, material)
    
    // Posicionar el marcador
    // Misma orientación que las líneas guía
    marker.position.set(stringPos, 0.2, fretPos)
    
    marker.userData.scaleIndex = index
    marker.userData.stringNumber = pos.string.toString()
    marker.userData.isScaleMarker = true

    guitar.add(marker)
    scaleMarkers.push(marker)
  })

  console.log('Marcadores de escala creados:', scaleMarkers.length)
}

// Limpiar marcadores de escala
function clearScaleMarkers() {
  scaleMarkers.forEach(marker => {
    guitar.remove(marker)
    marker.geometry.dispose()
    marker.material.dispose()
  })
  scaleMarkers = []
}

// Obtener posición X de la cuerda
function getStringPosition(stringNumber) {
  const stringPositions = [-0.14, -0.092, -0.044, 0.024, 0.072, 0.12]
  return stringPositions[6 - stringNumber]  // Invertir orden
}

// Obtener posición Z del traste
function getFretPosition(fretNumber) {
  // Distribución de trastes en el mástil (aproximada)
  const fretSpacing = 0.18
  const startPos = -1.0  // Inicio del mástil
  return startPos + (fretNumber * fretSpacing)
}

// Reproducir escala completa con animación
async function playScale() {
  if (isPlayingScale || scaleMarkers.length === 0) return
  
  isPlayingScale = true
  const playBtn = document.getElementById('play-scale-btn')
  if (playBtn) playBtn.disabled = true

  for (let i = 0; i < scaleMarkers.length; i++) {
    const marker = scaleMarkers[i]
    const stringNum = marker.userData.stringNumber

    // Animar marcador (iluminar)
    gsap.to(marker.material, {
      emissive: new THREE.Color(0xffd700),
      opacity: 1,
      duration: 0.2
    })

    gsap.to(marker.scale, {
      x: 1.5,
      y: 1.5,
      z: 1.5,
      duration: 0.3,
      ease: 'elastic.out(1, 0.5)'
    })

    // Reproducir nota
    playString(stringNum)

    // Esperar antes de la siguiente nota
    await new Promise(resolve => setTimeout(resolve, 500))

    // Desanimar marcador
    gsap.to(marker.material, {
      emissive: new THREE.Color(0x000000),
      opacity: 0.6,
      duration: 0.3
    })

    gsap.to(marker.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 0.3
    })
  }

  isPlayingScale = false
  if (playBtn) playBtn.disabled = false
}

// Event listeners para UI de escalas
function setupScaleUI() {
  const playBtn = document.getElementById('play-scale-btn')
  const scaleSelect = document.getElementById('scale-type')
  const rootSelect = document.getElementById('root-note')

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      playScale()
    })
  }

  if (scaleSelect) {
    scaleSelect.addEventListener('change', () => {
      createScaleMarkers()
    })
  }

  if (rootSelect) {
    rootSelect.addEventListener('change', () => {
      createScaleMarkers()
    })
  }
}

// ========================================
// Efecto Visual de Círculo al Tocar
// ========================================
function createHitEffect(position) {
  // Crear círculo que se expande y desvanece
  const geometry = new THREE.RingGeometry(0.02, 0.05, 32)
  const material = new THREE.MeshBasicMaterial({
    color: 0xd4af37,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide
  })
  const ring = new THREE.Mesh(geometry, material)

  // Posicionar el efecto donde se tocó
  ring.position.copy(position)
  ring.lookAt(camera.position)

  scene.add(ring)
  hitEffects.push(ring)

  // Animar: expandir y desvanecer
  gsap.to(ring.scale, {
    x: 8,
    y: 8,
    z: 8,
    duration: 0.6,
    ease: 'power2.out'
  })

  gsap.to(material, {
    opacity: 0,
    duration: 0.6,
    ease: 'power2.out',
    onComplete: () => {
      scene.remove(ring)
      geometry.dispose()
      material.dispose()
      hitEffects = hitEffects.filter(e => e !== ring)
    }
  })
}

// ========================================
// Interacción con la Guitarra
// ========================================
function setupGuitarInteraction() {
  const raycaster = new THREE.Raycaster()
  raycaster.params.Line.threshold = 0.1  // Hacer las líneas más fáciles de clicar
  const mouse = new THREE.Vector2()

  // Efecto hover sobre las líneas
  canvas.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

    raycaster.setFromCamera(mouse, camera)

    if (guitar) {
      const intersects = raycaster.intersectObject(guitar, true)
      
      // Resetear opacidad de todas las líneas
      guitar.traverse((child) => {
        if (child.userData.isStringGuide) {
          child.material.opacity = 0.3
        }
      })

      // Resaltar línea sobre la que está el mouse
      if (intersects.length > 0) {
        const hitObject = intersects[0].object
        if (hitObject.userData.isStringGuide) {
          hitObject.material.opacity = 0.8
          canvas.style.cursor = 'pointer'
          return
        }
      }
      canvas.style.cursor = 'default'
    }
  })

  canvas.addEventListener('click', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

    raycaster.setFromCamera(mouse, camera)

    if (guitar) {
      const intersects = raycaster.intersectObject(guitar, true)

      if (intersects.length > 0) {
        const hitObject = intersects[0].object
        const hitPoint = intersects[0].point

        // Verificar si se hizo clic en una línea guía
        if (hitObject.userData.isStringGuide) {
          const stringNum = hitObject.userData.stringNumber
          
          // Reproducir sonido de la cuerda
          playString(stringNum)

          // Crear efecto visual en el punto de clic
          createHitEffect(hitPoint)

          console.log('Cuerda tocada:', stringNum)
        }
      }
    }
  })
}

// ========================================
// Inicialización
// ========================================
function init() {
  // Crear escena
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0a0f)

  // Crear cámara
  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.set(0, 0, 5)

  // Crear renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
  })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2

  // Agregar luces
  setupLights()

  // Crear controles de órbita
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.enableZoom = false  // Desactivar zoom con scroll para no interferir con página
  controls.enablePan = false
  controls.autoRotate = false  // Desactivar rotación automática
  controls.autoRotateSpeed = 0.5

  // Solo permitir rotación con click izquierdo
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: null,
    RIGHT: null
  }

  // Cargar modelo de guitarra
  loadGuitarModel()

  // Configurar scroll animations
  setupScrollAnimations()

  // Event listeners
  window.addEventListener('resize', onWindowResize)

  // Inicializar audio
  initAudio()

  // Configurar interacción con la guitarra
  setupGuitarInteraction()

  // Configurar UI de escalas
  setupScaleUI()

  // Iniciar loop de animación
  animate()
}

// ========================================
// Luces
// ========================================
function setupLights() {
  // Luz ambiental suave
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
  scene.add(ambientLight)

  // Luz principal (key light)
  const mainLight = new THREE.DirectionalLight(0xfff5e6, 1)
  mainLight.position.set(5, 5, 5)
  mainLight.castShadow = true
  mainLight.shadow.mapSize.width = 2048
  mainLight.shadow.mapSize.height = 2048
  scene.add(mainLight)

  // Luz de relleno (fill light)
  const fillLight = new THREE.DirectionalLight(0xc9a227, 0.3)
  fillLight.position.set(-5, 0, -5)
  scene.add(fillLight)

  // Luz de acento (rim light)
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.5)
  rimLight.position.set(0, -5, -5)
  scene.add(rimLight)

  // Luz puntual cálida
  const pointLight = new THREE.PointLight(0xd4af37, 0.5, 10)
  pointLight.position.set(2, 2, 2)
  scene.add(pointLight)
}

// ========================================
// Cargar Modelo GLB de Guitarra
// ========================================
function loadGuitarModel() {
  const loader = new GLTFLoader()

  loader.load(
    '/models/classic_guitar.glb',
    (gltf) => {
      const model = gltf.scene

      // Calcular bounding box del modelo
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())

      // Calcular escala para que quepa bien en la escena (aumentada)
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 6 / maxDim  // Aumentado a 6 para hacer la guitarra aún más grande

      // Crear grupo contenedor para centrar correctamente
      guitar = new THREE.Group()

      // Escalar el modelo
      model.scale.setScalar(scale)

      // Mover el modelo para que su centro esté en el origen del grupo
      model.position.x = -center.x * scale
      model.position.y = -center.y * scale
      model.position.z = -center.z * scale

      // Agregar modelo al grupo contenedor
      guitar.add(model)

      // Rotar para que esté horizontal y mire hacia la cámara
      guitar.rotation.x = Math.PI / 2    // 90° para acostar la guitarra (horizontal)
      guitar.rotation.y = 0               // Sin rotación en Y
      guitar.rotation.z = 0               // 0° para que mire hacia la cámara (al otro lado)

      // Habilitar sombras en todos los meshes
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      // Actualizar el target de los controles al centro
      controls.target.set(0, 0, 0)
      controls.update()

      scene.add(guitar)

      // Agregar líneas visuales para las cuerdas
      createStringVisualGuides()

      // Crear marcadores de escala
      createScaleMarkers()

      // Ocultar loading screen cuando el modelo está listo
      hideLoadingScreen()

      console.log('Guitarra cargada exitosamente')
      console.log('Tamaño del modelo:', size)
    },
    (progress) => {
      // Actualizar barra de progreso
      if (progress.total > 0) {
        const percent = (progress.loaded / progress.total) * 100
        if (loaderProgress) {
          loaderProgress.style.width = `${percent}%`
        }
      }
    },
    (error) => {
      console.error('Error cargando el modelo:', error)
      // Si falla, crear placeholder
      createPlaceholderGuitar()
      hideLoadingScreen()
    }
  )
}

// ========================================
// Placeholder Guitar (fallback)
// ========================================
function createPlaceholderGuitar() {
  guitar = new THREE.Group()

  // Cuerpo simplificado
  const bodyGeometry = new THREE.CylinderGeometry(0.8, 1, 0.15, 32)
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b4513,
    roughness: 0.4,
    metalness: 0.1
  })
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.rotation.x = Math.PI / 2
  body.position.y = -0.5
  guitar.add(body)

  // Mástil
  const neckGeometry = new THREE.BoxGeometry(0.25, 2.5, 0.08)
  const neckMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d2817,
    roughness: 0.3
  })
  const neck = new THREE.Mesh(neckGeometry, neckMaterial)
  neck.position.y = 1
  guitar.add(neck)

  guitar.rotation.x = 0.3
  scene.add(guitar)
}

// ========================================
// Scroll Animations con GSAP
// ========================================
function setupScrollAnimations() {
  const sections = document.querySelectorAll('.section')

  // Animación de aparición de contenido de secciones
  sections.forEach((section) => {
    const content = section.querySelector('.section-content')

    ScrollTrigger.create({
      trigger: section,
      start: 'top 80%',
      end: 'bottom 20%',
      onEnter: () => content.classList.add('visible'),
      onLeave: () => content.classList.remove('visible'),
      onEnterBack: () => content.classList.add('visible'),
      onLeaveBack: () => content.classList.remove('visible')
    })
  })

  // Objeto proxy para animar la guitarra (evita conflictos con OrbitControls)
  const guitarAnimation = {
    rotX: Math.PI / 2,    // Horizontal
    rotY: 0,              // Sin rotación en Y
    rotZ: 0,              // Mirando hacia la cámara (al otro lado)
    posY: 0
  }

  // Timeline principal - anima la GUITARRA, no la cámara
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '.scroll-container',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
      onUpdate: () => {
        // Aplicar valores animados a la guitarra
        if (guitar) {
          guitar.rotation.x = guitarAnimation.rotX
          guitar.rotation.y = guitarAnimation.rotY
          guitar.rotation.z = guitarAnimation.rotZ
          guitar.position.y = guitarAnimation.posY
        }
      }
    }
  })

  // Intro: guitarra horizontal de frente
  // Anatomy: rotar para ver el costado
  tl.to(guitarAnimation, {
    rotX: Math.PI / 2,
    rotY: Math.PI / 4,
    rotZ: 0,
    duration: 1,
    ease: 'power1.inOut'
  }, 0)

  // Fretboard: rotar para ver el mástil desde arriba
  tl.to(guitarAnimation, {
    rotX: Math.PI / 3,
    rotY: 0,
    rotZ: 0,
    posY: 0.3,
    duration: 1,
    ease: 'power1.inOut'
  }, 1)

  // Scales: vista del mástil (inclinado para ver trastes)
  tl.to(guitarAnimation, {
    rotX: Math.PI / 4,
    rotY: 0,
    rotZ: 0,
    posY: 0.5,
    duration: 1,
    ease: 'power1.inOut'
  }, 2)

  // Play: volver a posición frontal horizontal
  tl.to(guitarAnimation, {
    rotX: Math.PI / 2,
    rotY: 0,
    rotZ: 0,
    posY: 0,
    duration: 1,
    ease: 'power1.inOut'
  }, 3)
}

// ========================================
// Loading Screen
// ========================================
function hideLoadingScreen() {
  // Simular progreso de carga
  gsap.to(loaderProgress, {
    width: '100%',
    duration: 1,
    ease: 'power2.out',
    onComplete: () => {
      gsap.to(loadingScreen, {
        opacity: 0,
        duration: 0.5,
        onComplete: () => {
          loadingScreen.classList.add('hidden')
        }
      })
    }
  })
}

// ========================================
// Resize Handler
// ========================================
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
}

// ========================================
// Animation Loop
// ========================================
function animate() {
  requestAnimationFrame(animate)

  // Actualizar controles
  controls.update()

  renderer.render(scene, camera)
}

// ========================================
// Iniciar aplicación
// ========================================
init()
