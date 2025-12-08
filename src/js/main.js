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
let scaleMajorBuffer = null  // Buffer para la escala completa
let hitEffects = []     // Efectos visuales activos
let scaleMarkers = []   // Marcadores de escala en el mástil
let scaleLabels = []    // Etiquetas HTML para las notas
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
  
  // Cargar escala mayor completa
  try {
    const response = await fetch('/sounds/C_majorScale.wav')
    const arrayBuffer = await response.arrayBuffer()
    scaleMajorBuffer = await audioContext.decodeAudioData(arrayBuffer)
    console.log('Escala mayor cargada')
  } catch (error) {
    console.error('Error cargando escala mayor:', error)
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
    
    // Material con Royal Blue accent color
    const material = new THREE.LineBasicMaterial({
      color: 0x2563EB,  // Royal Blue
      transparent: true,
      opacity: 0.5,     // Mayor opacidad para ser visible en fondo blanco
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

// Crear marcadores visuales de la escala con etiquetas
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
      color: 0x2563EB,  // Royal Blue accent
      emissive: 0x000000,
      metalness: 0.2,
      roughness: 0.7,
      transparent: true,
      opacity: 0.5
    })

    const marker = new THREE.Mesh(geometry, material)
    
    // Posicionar el marcador para vista lateral derecha
    // La guitarra está en posX:-2, rotY:-90°
    // Con la rotación, X local mueve hacia adelante/atrás en pantalla
    marker.position.set(stringPos, 0.49, fretPos-2.32)
    
    marker.userData.scaleIndex = index
    marker.userData.stringNumber = pos.string.toString()
    marker.userData.note = pos.note
    marker.userData.fret = pos.fret
    marker.userData.string = pos.string
    marker.userData.isScaleMarker = true

    guitar.add(marker)
    scaleMarkers.push(marker)

    // Crear etiqueta HTML para esta nota
    createNoteLabel(marker, pos)
  })

  console.log('Marcadores de escala creados:', scaleMarkers.length)
}

// Crear etiqueta HTML para mostrar información de la nota
function createNoteLabel(marker, position) {
  const label = document.createElement('div')
  label.className = 'note-label'
  label.innerHTML = `
    <div class="note-name">${position.note}</div>
    <div class="note-info">Cuerda ${position.string} - Traste ${position.fret}</div>
  `
  label.style.opacity = '0'
  document.body.appendChild(label)
  
  scaleLabels.push({ element: label, marker: marker })
}

// Limpiar marcadores de escala y etiquetas
function clearScaleMarkers() {
  scaleMarkers.forEach(marker => {
    guitar.remove(marker)
    marker.geometry.dispose()
    marker.material.dispose()
  })
  scaleMarkers = []
  
  // Limpiar etiquetas HTML
  scaleLabels.forEach(({ element }) => {
    if (element.parentNode) {
      element.parentNode.removeChild(element)
    }
  })
  scaleLabels = []
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

// Reproducir escala completa con animación sincronizada
async function playScale() {
  if (isPlayingScale || scaleMarkers.length === 0) return
  
  if (!scaleMajorBuffer) {
    console.error('Audio de escala no cargado')
    return
  }
  
  isPlayingScale = true
  const playBtn = document.getElementById('play-scale-btn')
  if (playBtn) playBtn.disabled = true

  // Reanudar contexto si está suspendido
  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }

  // Reproducir audio completo de la escala
  const source = audioContext.createBufferSource()
  source.buffer = scaleMajorBuffer
  const gainNode = audioContext.createGain()
  gainNode.gain.value = 0.8
  source.connect(gainNode)
  gainNode.connect(audioContext.destination)
  source.start(0)
  
  console.log('Reproduciendo escala mayor')

  // Animar marcadores con 500ms entre cada uno
  const noteDuration = 500  // medio segundo por nota
  
  for (let i = 0; i < scaleMarkers.length; i++) {
    const marker = scaleMarkers[i]

    // Animar marcador (iluminar)
    gsap.to(marker.material, {
      emissive: new THREE.Color(0x2563EB),  // Royal Blue glow
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

    // Esperar medio segundo antes de la siguiente nota
    await new Promise(resolve => setTimeout(resolve, noteDuration))

    // Desanimar marcador
    gsap.to(marker.material, {
      emissive: new THREE.Color(0x000000),
      opacity: 0.5,
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
    color: 0x2563EB,  // Royal Blue
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
  raycaster.params.Line.threshold = 0.2  // Hacer las líneas más fáciles de clicar
  const mouse = new THREE.Vector2()

  // Efecto hover sobre las líneas
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mouse, camera)

    if (guitar) {
      const intersects = raycaster.intersectObject(guitar, true)
      
      // Resetear opacidad de todas las líneas
      guitar.traverse((child) => {
        if (child.userData.isStringGuide) {
          child.material.opacity = 0.5
        }
      })

      // Resaltar línea sobre la que está el mouse
      if (intersects.length > 0) {
        const hitObject = intersects[0].object
        if (hitObject.userData.isStringGuide) {
          hitObject.material.opacity = 0.9
          canvas.style.cursor = 'pointer'
          return
        }
      }
      canvas.style.cursor = 'default'
    }
  })

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

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
  scene.background = new THREE.Color(0xFAFAFA)  // Ghost White background

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
  // Luz ambiental más fuerte para ambiente clínico
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
  scene.add(ambientLight)

  // Luz principal (key light) - más suave
  const mainLight = new THREE.DirectionalLight(0xffffff, 0.6)
  mainLight.position.set(5, 5, 5)
  mainLight.castShadow = true
  mainLight.shadow.mapSize.width = 2048
  mainLight.shadow.mapSize.height = 2048
  scene.add(mainLight)

  // Luz de relleno (fill light) - neutral
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3)
  fillLight.position.set(-5, 0, -5)
  scene.add(fillLight)

  // Luz de acento (rim light) - suave
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.4)
  rimLight.position.set(0, -5, -5)
  scene.add(rimLight)
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
      guitar.position.z = -2              // Empieza más alejada

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
  const navLinks = document.querySelectorAll('.nav-link')

  // Función para actualizar el link activo
  function updateActiveNav(sectionId) {
    navLinks.forEach(link => {
      link.classList.remove('active')
      if (link.dataset.section === sectionId) {
        link.classList.add('active')
      }
    })
  }

  // Manejar clicks en la navegación para scroll suave con offset correcto
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      const targetId = link.getAttribute('href').substring(1)
      const targetSection = document.getElementById(targetId)

      if (targetSection) {
        // Para la sección de escalas, hacer scroll más abajo para que la animación complete
        const offset = targetId === 'scales' ? window.innerHeight * 0.5 : 0
        const targetPosition = targetSection.offsetTop + offset

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        })
      }
    })
  })

  // Animación de aparición de contenido de secciones
  sections.forEach((section) => {
    const content = section.querySelector('.section-content')
    const sectionId = section.dataset.section
    const isScalesSection = sectionId === 'scales'

    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: isScalesSection ? 'bottom bottom' : 'bottom 50%',
      onEnter: () => {
        content.classList.add('visible')
        updateActiveNav(sectionId)
      },
      onLeave: () => {
        if (!isScalesSection) content.classList.remove('visible')
      },
      onEnterBack: () => {
        content.classList.add('visible')
        updateActiveNav(sectionId)
      },
      onLeaveBack: () => content.classList.remove('visible')
    })
  })

  // Objeto proxy para animar la guitarra (evita conflictos con OrbitControls)
  const guitarAnimation = {
    rotX: Math.PI / 2,    // Horizontal
    rotY: 0,              // Sin rotación en Y
    rotZ: 0,              // Mirando hacia la cámara (al otro lado)
    posX: 0,              // Posición horizontal (izquierda/derecha)
    posY: 0,
    posZ: -2,             // Empieza más alejada
    scale: 1              // Escala para zoom
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
          guitar.position.x = guitarAnimation.posX
          guitar.position.y = guitarAnimation.posY
          guitar.position.z = guitarAnimation.posZ
          guitar.scale.set(guitarAnimation.scale, guitarAnimation.scale, guitarAnimation.scale)
        }
      }
    }
  })

  // Intro: guitarra horizontal de frente, se acerca e inclina a la derecha
  // Anatomy: rotar para ver el costado (hacia la derecha)
  tl.to(guitarAnimation, {
    rotX: Math.PI / 2,
    rotY: -Math.PI / 4,   // Negativo para inclinarse a la derecha
    rotZ: 0,
    posX: 0,
    posY: 0,
    posZ: 0,              // Se acerca
    scale: 1,
    duration: 1,
    ease: 'power1.inOut'
  }, 0)

  // Fretboard: hacer zoom y bajar por el mástil (de arriba hacia abajo)
  tl.to(guitarAnimation, {
    rotX: Math.PI / 2.5,  // Vista ligeramente inclinada desde arriba
    rotY: -Math.PI / 6,   // Mantener ligera inclinación lateral
    rotZ: 0,
    posX: 0,
    posY: -0.8,           // Bajar para ver el mástil desde arriba
    posZ: 2,              // Acercar mucho (zoom in)
    scale: 1.5,           // Zoom adicional con escala
    duration: 1,
    ease: 'power1.inOut'
  }, 1)

  // Scales: vista del mástil desde el lado derecho
  tl.to(guitarAnimation, {
    rotX: Math.PI / 2,    // Horizontal
    rotY: -Math.PI / 2,   // Girar 90° para ver desde el lado
    rotZ: 0,
    posX: -2,           // Mover a la derecha de la pantalla (valores pequeños: -1 a -3)
    posY: 0,
    posZ: 1,              // Acercar un poco
    scale: 1.8,           // Zoom moderado
    duration: 0.5,
    ease: 'power2.out'
  }, 2)
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
// Actualizar etiquetas de notas
// ========================================
function updateNoteLabels() {
  // Solo mostrar etiquetas en la sección de escalas
  const scalesSection = document.getElementById('scales')
  if (!scalesSection) return
  
  const rect = scalesSection.getBoundingClientRect()
  const isScalesSectionVisible = rect.top < window.innerHeight && rect.bottom > 0
  
  scaleLabels.forEach(({ element, marker }) => {
    if (!isScalesSectionVisible) {
      element.style.opacity = '0'
      return
    }
    
    // Obtener posición 3D del marcador en coordenadas del mundo
    const worldPos = new THREE.Vector3()
    marker.getWorldPosition(worldPos)
    
    // Proyectar a coordenadas de pantalla
    const screenPos = worldPos.clone().project(camera)
    
    // Convertir a coordenadas de píxeles
    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth
    const y = (-(screenPos.y * 0.5) + 0.5) * window.innerHeight
    
    // Solo mostrar si está delante de la cámara
    if (screenPos.z < 1) {
      element.style.left = `${x}px`
      element.style.top = `${y}px`
      element.style.opacity = '1'
    } else {
      element.style.opacity = '0'
    }
  })
}

// ========================================
// Animation Loop
// ========================================
function animate() {
  requestAnimationFrame(animate)

  // Actualizar controles
  controls.update()
  
  // Actualizar etiquetas de notas
  updateNoteLabels()

  renderer.render(scene, camera)
}

// ========================================
// Iniciar aplicación
// ========================================
init()
