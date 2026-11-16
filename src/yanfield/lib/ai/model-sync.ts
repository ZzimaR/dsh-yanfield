import { getHarnessBridge, harnessRouteOf } from "@/lib/ai/harness-bridge"
import { tx } from "@/lib/db"
import * as repo from "@/lib/repo"
import type { ModelOption, ProviderConfig } from "@/lib/types"

function sameModels(left: ModelOption[], right: ModelOption[]): boolean {
  return left.length === right.length && left.every((model, index) =>
    model.id === right[index].id &&
    model.label === right[index].label &&
    model.contextWindow === right[index].contextWindow,
  )
}

/** Keep a stable provider ID per DSH route, including the route already saved in older databases. */
export async function syncHarnessProviders(): Promise<ProviderConfig[]> {
  const routes = await getHarnessBridge()?.listRoutes?.().catch(() => undefined)
  if (!routes) return repo.listProviders()
  const catalog = new Map(routes.map(route => [route.id, route]))

  return tx(() => {
    const providers = repo.listProviders()
    const storedRoutes = new Set<string>()
    const updated = providers.map(provider => {
      if (provider.kind !== "harness") return provider
      const routeId = harnessRouteOf(provider.baseUrl)
      const route = routeId ? catalog.get(routeId) : undefined
      if (!route) return { ...provider, available: false, unavailableReason: "宿主没有注册当前路由" }
      storedRoutes.add(route.id)
      const models = route.models.length ? route.models : provider.models
      const saved = provider.name !== route.name || !sameModels(provider.models, models)
        ? repo.updateProvider(provider.id, { name: route.name, models })
        : provider
      return { ...saved, available: route.available && route.models.length > 0, unavailableReason: route.unavailableReason }
    })
    for (const route of catalog.values()) {
      if (storedRoutes.has(route.id)) continue
      const provider = repo.createProvider({
        name: route.name,
        kind: "harness",
        baseUrl: `harness:${route.id}`,
        models: route.models,
      })
      updated.push({ ...provider, available: route.available && route.models.length > 0, unavailableReason: route.unavailableReason })
    }
    return updated
  })
}
