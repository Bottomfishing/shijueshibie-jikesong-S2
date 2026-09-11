/**
 * 进入页逻辑：名字未定，页面只做一件事——把访客送进体验页。
 * URL 上的查询参数（?input=mouse、?delegate 等）原样带给体验页，
 * 保证从进入页进来和直接打开 app.html 的行为完全一致。
 * 键盘 Enter / 空格 也能进入，配合"零对话框"的轻量感。
 */
function enter(): void {
  // 必须用相对路径：打包桌面端从 file:// 加载时，绝对路径会跳到盘符根目录导致白屏
  window.location.href = `./app.html${window.location.search}`
}

const handCursor = document.getElementById('hand-cursor')
let cursorX = window.innerWidth / 2
let cursorY = window.innerHeight / 2
let targetX = cursorX
let targetY = cursorY
let pressed = false
let activePointerId: number | null = null
let lastSampleX = targetX
let lastSampleY = targetY
let strokeDistance = 0
let strokeSpeed = 0

function animateCursor(): void {
  cursorX += (targetX - cursorX) * 0.22
  cursorY += (targetY - cursorY) * 0.22
  // 位置走 left/top（平滑由上面的 lerp 负责）；旋转/缩放留给 CSS class，
  // 否则每帧内联 transform 会覆盖 .pressed 的按压动画
  if (handCursor) {
    handCursor.style.left = `${cursorX}px`
    handCursor.style.top = `${cursorY}px`
  }
  requestAnimationFrame(animateCursor)
}

if (handCursor && matchMedia('(pointer: fine)').matches) {
  window.addEventListener('pointermove', (event) => {
    targetX = event.clientX
    targetY = event.clientY
    handCursor.classList.add('visible')

    const dx = targetX - lastSampleX
    const dy = targetY - lastSampleY
    const distance = Math.hypot(dx, dy)
    strokeSpeed = Math.min(1, distance / 24)
    if (pressed && activePointerId === event.pointerId && distance > 0) {
      strokeDistance += distance
      const angle = Math.max(-10, Math.min(10, dx * 0.32))
      handCursor.style.setProperty('--stroke-angle', `${angle}deg`)
      handCursor.classList.add('stroking')
      window.dispatchEvent(
        new CustomEvent('wisp-stroke', {
          detail: {
            x: targetX / window.innerWidth,
            y: targetY / window.innerHeight,
            dx,
            dy,
            speed: strokeSpeed,
            distance,
            totalDistance: strokeDistance,
            active: true,
          },
        }),
      )
    }
    lastSampleX = targetX
    lastSampleY = targetY
  })
  window.addEventListener('pointerdown', (event) => {
    pressed = true
    activePointerId = event.pointerId
    strokeDistance = 0
    lastSampleX = event.clientX
    lastSampleY = event.clientY
    handCursor.classList.add('pressed')
    window.dispatchEvent(
      new CustomEvent('wisp-stroke-start', {
        detail: { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight },
      }),
    )
  })
  const finishStroke = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return
    pressed = false
    activePointerId = null
    handCursor.classList.remove('pressed', 'stroking')
    handCursor.style.setProperty('--stroke-angle', '0deg')
    window.dispatchEvent(new CustomEvent('wisp-stroke-end', { detail: { totalDistance: strokeDistance } }))
  }
  window.addEventListener('pointerup', finishStroke)
  window.addEventListener('pointercancel', finishStroke)
  window.addEventListener('blur', () => {
    pressed = false
    activePointerId = null
    handCursor.classList.remove('pressed', 'stroking')
    handCursor.style.setProperty('--stroke-angle', '0deg')
  })
  window.addEventListener('pointerleave', () => handCursor.classList.remove('visible'))
  window.addEventListener('pointerenter', () => handCursor.classList.add('visible'))
  animateCursor()
}

document.getElementById('enter')?.addEventListener('click', enter)

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.code === 'Enter' || e.code === 'Space') enter()
})
