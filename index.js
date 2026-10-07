/**
 * Host loader entry for dsh-glass-mood-theme.
 *
 * The theme is entirely browser-side: it registers no tool, reads no config and
 * owns no host state. The row exists so the client half (`exports["./client"]`)
 * enters the web bundle graph, where `dsh.client` sends it to the browser.
 */
export const name = 'glass-mood-theme'

/** Provides no host-side behavior. */
export function apply() {}
