/**
 * 首次启动引导：内置提示词预设、演示 Provider、示例作品
 * 幂等：多次调用不会重复插入；内置提示词与代码不一致时会同步。
 */
import { getHarnessBridge } from "./ai/harness-bridge";
import { get } from "./db";
import {
  BUILTIN_PRESETS,
  DEMO_BLUEPRINTS,
  DEMO_CHARACTERS,
  DEMO_CHAPTERS,
  DEMO_FORESHADOWS,
  DEMO_NOVEL,
  DEMO_NOVEL_OUTLINE,
  DEMO_VOLUMES,
  DEMO_VOLUME_OUTLINES,
  DEMO_WORLD,
  demoArchiveContent,
  getProviderPreset,
} from "./defaults";
import * as repo from "./repo";
import type { AppSettings, Novel, ProviderConfig, Volume } from "./types";
import { DEFAULT_APP_SETTINGS } from "./types";

let ready = false;

export function isReady(): boolean {
  return ready;
}

export function ensureReady(): void {
  if (ready) return;
  ready = true;
  try {
    repo.ensureBuiltinPresets(BUILTIN_PRESETS);
    ensureDefaultSettings();
    ensureDemoProvider();
    ensureEnvProviders();
    ensureHarnessProvider();
    if (repo.listNovels().length === 0) seedDemo();
  } catch (err) {
    ready = false;
    throw err;
  }
}

export function ensureDefaultSettings(): AppSettings {
  const current = repo.getSettings();
  if (JSON.stringify(current) !== JSON.stringify(DEFAULT_APP_SETTINGS)) {
    return repo.saveSettings({});
  }
  return current;
}

export function ensureDemoProvider(): ProviderConfig {
  const existing = repo.listProviders();
  if (existing.length > 0) {
    if (!repo.getSettings().models.chat.providerId) {
      const first = existing.find((p) => p.enabled) ?? existing[0];
      repo.saveSettings({
        models: {
          chat: { providerId: first.id, model: first.models[0]?.id ?? "" },
          prose: { providerId: first.id, model: first.models[0]?.id ?? "" },
        },
      });
    }
    return existing[0];
  }
  const provider = repo.createProvider({
    name: "离线演示模式",
    kind: "demo",
    baseUrl: "",
    apiKey: "",
    models: [
      { id: "yanfield-demo", label: "砚田演示模型（离线，无需 Key）" },
      { id: "yanfield-demo-prose", label: "砚田演示模型 · 正文" },
    ],
    enabled: true,
  });
  repo.saveSettings({
    models: {
      chat: { providerId: provider.id, model: "yanfield-demo" },
      prose: { providerId: provider.id, model: "yanfield-demo-prose" },
    },
  });
  return provider;
}

/** 按环境变量自动创建真实模型服务（Docker / 自托管一键接上 DeepSeek） */
export function ensureEnvProviders(): ProviderConfig[] {
  const created: ProviderConfig[] = [];
  const existing = repo.listProviders();
  const order = ["deepseek"];

  const readEnv = (keys: string[]): string => {
    for (const key of keys) {
      const value = process.env[key];
      if (value && value.trim()) return value.trim();
    }
    return "";
  };

  for (const presetKey of order) {
    const preset = getProviderPreset(presetKey);
    if (!preset) continue;
    const apiKey = readEnv(preset.envKeys);
    if (!apiKey) continue;
    if (existing.some((provider) => provider.name === preset.name)) continue;
    created.push(
      repo.createProvider({
        name: preset.name,
        kind: preset.kind,
        baseUrl: preset.baseUrl,
        apiKey,
        models: [],
        enabled: true,
      }),
    );
  }

  if (created.length === 0) return created;

  // 如果当前模型还指向演示模式（或未设置），自动切到刚创建的真实服务
  const settings = repo.getSettings();
  const current = settings.models.chat.providerId
    ? repo.listProviders().find((provider) => provider.id === settings.models.chat.providerId)
    : undefined;
  if (!current || current.kind === "demo") {
    const first = created[0];
    const chatModel = first.models[0]?.id ?? "";
    repo.saveSettings({
      models: {
        chat: { providerId: first.id, model: chatModel },
        prose: { providerId: first.id, model: chatModel },
      },
    });
  }
  return created;
}

/** DSH 插件里优先使用 Harness 已经配好的模型。已有官方 Key 服务时不抢默认值。 */
export function ensureHarnessProvider(): ProviderConfig | undefined {
  if (process.env.YANFIELD_IN_DSH !== "1") return undefined;
  const bridge = getHarnessBridge();
  const route = bridge?.providerRoute() || "deepseek";
  const model = bridge?.defaultModel() || "deepseek-flash";
  const models = [{ id: model, label: `${model}（Harness 当前模型）`, contextWindow: 1_000_000 }];
  let provider = repo.listProviders().find((item) => item.kind === "harness");
  if (!provider) {
    provider = repo.createProvider({
      name: "DeepSeek Harness",
      kind: "harness",
      baseUrl: `harness:${route}`,
      apiKey: "",
      models,
      enabled: true,
    });
  }
  const settings = repo.getSettings();
  const current = settings.models.chat.providerId
    ? repo.listProviders().find((item) => item.id === settings.models.chat.providerId)
    : undefined;
  if (!current || current.kind === "demo" || !settings.models.chat.model) {
    repo.saveSettings({
      models: {
        chat: { providerId: provider.id, model: provider.models[0]?.id || model },
        prose: { providerId: provider.id, model: provider.models[0]?.id || model },
      },
    });
  }
  return provider;
}

/** 写入示例作品《潮信》：卷/章/大纲/角色/设定/伏笔/档案/对话 */
export function seedDemo(): Novel {
  const novel = repo.createNovel(DEMO_NOVEL);
  const volumes: Volume[] = DEMO_VOLUMES.map((v) => {
    const volume = repo.createVolume(novel.id, { title: v.title, summary: v.summary });
    return volume;
  });

  const chapters = DEMO_CHAPTERS.map((ch, i) => {
    const volume = volumes[ch.volumeIndex] ?? volumes[0];
    const chapter = repo.createChapter(novel.id, {
      title: ch.title,
      volumeId: volume?.id ?? null,
      content: ch.content,
    });
    if (ch.summary || ch.status !== "draft") {
      repo.updateChapter(chapter.id, { summary: ch.summary, status: ch.status });
    }
    return chapter;
  });

  repo.saveNovelOutline(novel.id, DEMO_NOVEL_OUTLINE);
  volumes.forEach((v, i) => {
    const plan = DEMO_VOLUME_OUTLINES[i];
    if (plan) repo.saveVolumeOutline(v.id, plan);
  });

  DEMO_BLUEPRINTS.forEach((bp, i) => {
    const chapter = chapters[i];
    if (chapter) repo.saveBlueprint(chapter.id, bp);
  });

  const characterIdByName = new Map<string, string>();
  for (const def of DEMO_CHARACTERS) {
    const created = repo.createCharacter(novel.id, { ...def });
    characterIdByName.set(def.name, created.id);
  }
  // 把 relations 里的姓名替换成真实 ID
  for (const def of DEMO_CHARACTERS) {
    const id = characterIdByName.get(def.name);
    if (!id) continue;
    const relations = (def.relations ?? []).map((r) => ({ ...r, targetId: characterIdByName.get(r.targetId) ?? r.targetId }));
    repo.updateCharacter(id, { relations });
  }

  for (const def of DEMO_WORLD) repo.createWorld(novel.id, { ...def });
  for (const def of DEMO_FORESHADOWS) repo.createForeshadow(novel.id, { ...def });

  const archives = demoArchiveContent();
  archives.forEach((def, i) => {
    const chapter = chapters[i];
    if (!chapter) return;
    repo.upsertArchive({ ...def, novelId: novel.id, chapterId: chapter.id });
  });

  const session = repo.createChatSession(novel.id, { agentId: "supervisor", chapterId: chapters[0]?.id ?? null, title: "开篇怎么抓人" });
  repo.addMessage(session.id, {
    role: "user",
    content: "我写了一章，但感觉开头有点慢，总觉得抓不住人。你帮我看看问题在哪？",
  });
  repo.addMessage(session.id, {
    role: "assistant",
    content:
      "我看了《第一章 空信》。问题不是慢，是**前两段还在点信，第三封才让记账人自己被卷进去**。\n\n三点建议：\n\n1. **先看见自己的名字。** 现在第三封信出现得够早，但周晚马上翻过去去登记别的。让他的手指在自己的名字上停一下，读者才知道这封信不一样。\n2. **规矩用动作写。** 「别拆」已经很好，可以再补一个他平时会做、今天没做的动作，比如把信角对齐。\n3. **纸船不要解释。** 章末停在「自取」两个字就够了，不要补谁放的。\n\n要不要我按这个思路给你两版开头？一版更冷，一版让小满更早入画。",
    model: "离线演示模式 · 主编",
  });

  return novel;
}

/** 供 `pnpm db:seed` 使用 */
export function resetDemo(): { ok: true; novelId: string } {
  for (const nv of repo.listNovels()) {
    if (nv.author === "砚田示例" || nv.title === "长夜行" || nv.title === "潮信") repo.deleteNovel(nv.id);
  }
  const novel = seedDemo();
  return { ok: true, novelId: novel.id };
}

// 供脚本/调试使用
export const __internal = { get };
