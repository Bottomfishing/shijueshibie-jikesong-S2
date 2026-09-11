/**
 * 进入页逻辑：名字未定，页面只做一件事——把访客送进体验页。
 * URL 上的查询参数（?input=mouse、?delegate 等）原样带给体验页，
 * 保证从进入页进来和直接打开 app.html 的行为完全一致。
 * 键盘 Enter / 空格 也能进入，配合"零对话框"的轻量感。
 */
function enter(): void {
  window.location.href = `/app.html${window.location.search}`
}

document.getElementById('enter')?.addEventListener('click', enter)

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.code === 'Enter' || e.code === 'Space') enter()
})
