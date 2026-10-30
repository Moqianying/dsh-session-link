/**
 * dsh-session-link-client 的 Node 半侧：故意什么都不做。
 *
 * 这个包存在只为携带浏览器半侧（`dsh.client` → `./client`）：loader 行必须能
 * 解析到一个可挂载的宿主插件，client-modules 才会把它的 `dsh.client` 声明
 * 变成 `/plugins` 下可加载的 bundle。真正的宿主逻辑（记忆注入、工具、HTTP
 * 路由）在 `dsh-session-link` 里。
 *
 * @module dsh-session-link-client
 */

/** 插件名。 */
export const name = 'session-link-client'

/** 不依赖任何宿主服务即可挂载。 */
export const inject = []

/** 空实现：浏览器半侧由 client-modules 负责送达。 */
export function apply() {}
