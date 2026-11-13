"use client";

import { useT } from "@/lib/i18n";
import { useApi } from "@/lib/client/api";
import { openSettingsDialog } from "@/components/settings/open";
import type { AppSettings, ProviderConfig, ProviderKind } from "@/lib/types";

type ListedProvider = ProviderConfig & { hasKey?: boolean };

function needsKey(kind: ProviderKind): boolean {
  return kind !== "demo" && kind !== "harness";
}

/** 当前对话模型没填 Key，或还停在离线演示时，在卡片上说明点了会怎样。 */
export function ModelKeyHint() {
  const tr = useT();
  const settings = useApi<AppSettings>("/api/settings");
  const providers = useApi<{ items: ListedProvider[] }>("/api/providers");
  if (!settings.data || !providers.data) return null;

  const list = providers.data.items.filter((item) => item.enabled);
  const wanted = settings.data.models.chat.providerId;
  const provider = list.find((item) => item.id === wanted) ?? list.find((item) => item.kind === "demo") ?? list[0];

  let text = "";
  if (!provider) {
    text = tr("还没有可用的模型。去设置里添加一个 DeepSeek 服务并填写 API Key，补全和衍生才会按这本书来写。");
  } else if (provider.kind === "harness" && !settings.data.models.chat.model) {
    text = tr("已接上 DeepSeek Harness，但还没选择模型。去设置里拉取或填写模型 ID。");
  } else if (provider.kind === "demo") {
    text = tr("当前是离线演示模型，没有 API Key。点「补全」或「衍生」只会填入示例句子，不是按这本书生成的。");
  } else if (needsKey(provider.kind) && !provider.hasKey) {
    text = tr("「{provider}」还没填 API Key。现在点「补全」或「衍生」会失败。", { provider: provider.name });
  }
  if (!text) return null;

  return (
    <p className="rounded-lg border border-line bg-accent-soft/60 px-3.5 py-2.5 text-[12px] leading-5 text-ink-2">
      {text}{" "}
      <button type="button" className="font-medium text-accent hover:underline" onClick={() => openSettingsDialog("providers")}>
        {tr("去设置填写")}
      </button>
    </p>
  );
}
