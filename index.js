/**
 * dsh-glass-mood-theme 的宿主侧加载入口。
 *
 * 主题完全在浏览器侧：它不注册任何工具，不读任何配置，也不持有任何宿主状态。
 * 这一行存在的唯一目的，是让客户端那一半（`exports["./client"]`）进入 web
 * bundle 图——在那里，`dsh.client` 会把它送进浏览器。
 */
export const name = 'glass-mood-theme'

/** 不提供任何宿主侧行为。 */
export function apply() {}
