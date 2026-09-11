/**
 * 进入页逻辑：名字未定，页面只做一件事——把访客送进体验页。
 * URL 上的查询参数（?input=mouse、?delegate 等）原样带给体验页，
 * 保证从进入页进来和直接打开 app.html 的行为完全一致。
 * 键盘 Enter / 空格 也能进入，配合"零对话框"的轻量感。
 */
function enter(): void {
  window.location.href = `/app.html${window.location.search}`
}

const handCursor = document.getElementById('hand-cursor')
let cursorX = window.innerWidth / 2
let cursorY = window.innerHeight / 2
let targetX = cursorX
let targetY = cursorY
let raf = 0

function animateCursor(): void {
  cursorX += (targetX - cursorX) * 0.22
  cursorY += (targetY - cursorY) * 0.22
  if (handCursor) handCursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0) rotate(-12deg) scale(0.84)`
  raf = requestAnimationFrame(animateCursor)
}

if (handCursor && matchMedia('(pointer: fine)').matches) {
  window.addEventListener('pointermove', (event) => {
    targetX = event.clientX
    targetY = event.clientY
    handCursor.classList.add('visible')
  })
  window.addEventListener('pointerdown', () => handCursor.classList.add('pressed'))
  window.addEventListener('pointerup', () => handCursor.classList.remove('pressed'))
  window.addEventListener('pointerleave', () => handCursor.classList.remove('visible'))
  window.addEventListener('pointerenter', () => handCursor.classList.add('visible'))
  animateCursor()
} else {
  cancelAnimationFrame(raf)
}

document.getElementById('enter')?.addEventListener('click', enter)

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.code === 'Enter' || e.code === 'Space') enter()
})
