"use client";

/**
 * 面板级内存快照。
 *
 * 宿主切到工作区聊天时，砚田这块 React 树会被整体卸载（client/index.tsx 的挂载清理
 * 会 unmount 根节点），切回来是一棵全新的树，所有 useState 都归零。这里放一份
 * 进程内缓存，让「切走再切回」能回到原样：
 *
 * - 只存对象引用、不做序列化：不写 localStorage，也不写 sessionStorage；DSH 退出后
 *   随进程一起消失，不会在磁盘上留下任何残留；
 * - 不注册定时器、不挂事件监听：缓存本身没有副作用，界面卸载后不占 CPU；
 * - 用 LRU 上限兜底（最多 12 条 ≈ 最近几本书），长时间写作不会把历史会话无限堆在内存里。
 */

const MAX_ENTRIES = 12;

const cache = new Map<string, unknown>();

/** 读取并「触碰」key：命中后挪到队尾，淘汰时先丢最久没用的那条。 */
export function readSession<T>(key: string): T | undefined {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key) as T;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

/** 写入快照；超出上限时淘汰最久没用过的一条。 */
export function writeSession(key: string, value: unknown): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}
