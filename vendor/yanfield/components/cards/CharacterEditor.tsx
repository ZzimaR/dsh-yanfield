"use client";

/**
 * 角色编辑 Sheet
 * 编辑：GET/PATCH /api/characters/[id]；新建：POST /api/characters；删除：DELETE /api/characters/[id]
 * AI 助手：引用当前资料进入写作台 Agent，弹窗不直接生成或保存。
 */
import * as React from "react";
import { Sparkles, Trash2 } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Input,
  Select,
  Sheet,
  Switch,
  useToast,
} from "@/components/ui/kit";
import { CardEditorDocument, CardEditorHero, CardEditorSection as EditorSection } from "./CardEditorDocument";
import { FloatWindow } from "@/components/editor/FloatWindow";
import { referenceCardInAssistant } from "@/lib/editor/hand-off";
import { ModelKeyHint } from "@/components/ai/ModelKeyHint";
import { AiTextField, TagsInput, stripChapterNumber, unwrapEntity, useErrorToast } from "@/components/outline/form-kit";
import { apiDelete, apiPatch, apiPost, notifyDataChanged, useApi } from "@/lib/client/api";
import type { Character, CharacterRelation } from "@/lib/types";
import { CHARACTER_ROLE_LABEL } from "@/lib/types";
import { RelationsEditor } from "./RelationsEditor";

interface CharacterDraft {
  name: string;
  aliases: string[];
  role: Character["role"];
  gender: string;
  age: string;
  identity: string;
  appearance: string;
  personality: string;
  goals: string;
  secrets: string;
  arc: string;
  speechStyle: string;
  currentState: string;
  relations: CharacterRelation[];
  aiVisible: boolean;
  revealAtChapter: number | null;
  tags: string[];
  pinned: boolean;
}

function emptyDraft(): CharacterDraft {
  return {
    name: "",
    aliases: [],
    role: "supporting",
    gender: "",
    age: "",
    identity: "",
    appearance: "",
    personality: "",
    goals: "",
    secrets: "",
    arc: "",
    speechStyle: "",
    currentState: "",
    relations: [],
    aiVisible: true,
    revealAtChapter: null,
    tags: [],
    pinned: false,
  };
}

function toDraft(character: Character): CharacterDraft {
  return {
    name: character.name,
    aliases: [...character.aliases],
    role: character.role,
    gender: character.gender,
    age: character.age,
    identity: character.identity,
    appearance: character.appearance,
    personality: character.personality,
    goals: character.goals,
    secrets: character.secrets,
    arc: character.arc,
    speechStyle: character.speechStyle,
    currentState: character.currentState,
    relations: character.relations.map((relation) => ({ ...relation })),
    aiVisible: character.aiVisible,
    revealAtChapter: character.revealAtChapter,
    tags: [...character.tags],
    pinned: character.pinned,
  };
}

export function CharacterEditor({
  open,
  novelId,
  character,
  characters,
  chapters,
  onClose,
  onSaved,
  onDeleted,
  presentation = "sheet",
}: {
  open: boolean;
  novelId: string;
  character: Character | null;
  characters: Character[];
  chapters: { id: string; orderIndex: number; title: string }[];
  onClose: () => void;
  onSaved: (saved: Character) => void;
  onDeleted: () => void;
  /** 写作台里用可拖动的窗口，不盖成整页。 */
  presentation?: "sheet" | "float";
}) {
  const { toast } = useToast();
  const editing = Boolean(character);
  const detailApi = useApi<Character>(open && character ? `/api/characters/${character.id}` : null);
  const [draft, setDraft] = React.useState<CharacterDraft>(() => (character ? toDraft(character) : emptyDraft()));
  const [saving, setSaving] = React.useState(false);
  const dirtyRef=React.useRef(false);
  const baseStampRef=React.useRef(character?.updatedAt);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [savedId, setSavedId] = React.useState<string | null>(character?.id ?? null);
  const [minimized, setMinimized] = React.useState(false);
  const nextFloatKey = open ? (character?.id ?? "new") : "closed";
  const [floatKey, setFloatKey] = React.useState(nextFloatKey);
  if (floatKey !== nextFloatKey) {
    setFloatKey(nextFloatKey);
    dirtyRef.current=false;
    if (open) setMinimized(false);
  }
  const initKey = `${open ? 1 : 0}:${character?.id ?? "new"}:${detailApi.data?.updatedAt ?? ""}`;
  const lastInitKey = React.useRef("");

  useErrorToast(detailApi.error, "角色详情加载失败");

  const source = character ? detailApi.data && detailApi.data.id === character.id ? detailApi.data : character : null;

  React.useEffect(() => {
    if (lastInitKey.current === initKey) return;
    lastInitKey.current = initKey;
    if (!open || dirtyRef.current) return;
    baseStampRef.current=source?.updatedAt;
    setSavedId(source?.id ?? null);
    setDraft(source ? toDraft(source) : emptyDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey, open]);

  const update = <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) => {
    dirtyRef.current=true;
    setDraft((prev)=>({...prev,[key]:value}));
  };

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast({ title: "请先填写角色名", tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, name };
      const saved = savedId
        ? await apiPatch<Character>(`/api/characters/${savedId}`, {...payload,expectedUpdatedAt:baseStampRef.current})
        : await apiPost<Character>(`/api/characters`, { novelId, ...payload });
      const entity = unwrapEntity(saved);
      setSavedId(entity.id);
      onSaved(entity);
      notifyDataChanged("characters");
      toast({ title: editing ? "角色已保存" : "已新建角色", description: name, tone: "success" });
      onClose();
    } catch (err) {
      toast({ title: "保存角色失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!character) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/characters/${character.id}`);
      setConfirmDeleteOpen(false);
      onDeleted();
      notifyDataChanged("characters");
      toast({ title: "角色已删除", description: character.name, tone: "success" });
      onClose();
    } catch (err) {
      toast({ title: "删除角色失败", description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const openAssistant = () => {
    referenceCardInAssistant("character",savedId,draft.name.trim()||"新角色",{...draft});
    if(presentation==="float")setMinimized(true);
  };

  const chapterOptions = [
    { value: "", label: "不标注（AI 始终可见）" },
    ...chapters.map((chapter) => ({
      value: String(chapter.orderIndex + 1),
      label: `第 ${chapter.orderIndex + 1} 章 · ${stripChapterNumber(chapter.title)}`,
    })),
  ];

  const subtitle = [CHARACTER_ROLE_LABEL[draft.role], draft.identity].filter(Boolean).join(" · ");

  const footer = (
    <div className="card-editor-actions flex items-center gap-2 [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-accent/60 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-accent/60">
      {editing ? (
        <Button variant="ghost" className="text-ink-4 hover:text-danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDeleteOpen(true)}>
          删除
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button variant="primary" className="min-w-20 bg-accent text-accent-ink hover:bg-accent-hover" size="sm" loading={saving} onClick={save}>
          {savedId ? "保存" : "创建角色"}
        </Button>
      </div>
    </div>
  );

  const body = (
    <>
      <CardEditorDocument key={`${open}:${savedId??"new"}`}>
        <CardEditorHero kind="角色" value={draft.name} onChange={value=>update("name",value)} subtitle={subtitle || "人物的身份与故事，由你定义。"} actions={<Button variant="ghost" size="sm" className="font-semibold text-[#315b80] hover:bg-[#315b80]/[0.07] hover:text-[#20496e] dark:text-[#9dc4e7] dark:hover:bg-[#9dc4e7]/10 dark:hover:text-[#c1dbee]" icon={<Sparkles className="size-3.5"/>} onClick={openAssistant}>AI 助手</Button>}/>
        <ModelKeyHint />

        <EditorSection title="基本信息" hint="先定称呼与身份，AI 写作时会按这个口径称呼角色。">
          <div className="grid grid-cols-3 gap-4">
            <Select label="定位" value={draft.role} onChange={event=>update("role",event.target.value as Character["role"])} options={Object.entries(CHARACTER_ROLE_LABEL).map(([value,label])=>({value,label}))}/>
            <Input label="性别" value={draft.gender} placeholder="未填写" onChange={event=>update("gender",event.target.value)}/>
            <Input label="年龄" value={draft.age} placeholder="未填写" onChange={event=>update("age",event.target.value)}/>
          </div>
          <Input label="身份" value={draft.identity} placeholder="身份、职业、所属势力" onChange={event=>update("identity",event.target.value)}/>
          <TagsInput label="别名" value={draft.aliases} onChange={aliases=>update("aliases",aliases)} placeholder="称号、化名或外号"/>
        </EditorSection>

        <EditorSection title="外在" hint="外貌与说话风格，是 AI 写对白与动作的第一依据。">
          <AiTextField
            ai={false}
            label="外貌"
            field="角色外貌"
            feature="character-card"
            novelId={novelId}
            value={draft.appearance}
            onChange={(value) => update("appearance", value)}
            rows={2}
            placeholder="体貌、衣着、标志性细节"
          />
          <AiTextField
            ai={false}
            label="说话风格"
            field="角色说话风格"
            feature="character-card"
            novelId={novelId}
            value={draft.speechStyle}
            onChange={(value) => update("speechStyle", value)}
            rows={2}
            placeholder="句长、口癖、称呼习惯，最好举例"
          />
        </EditorSection>

        <EditorSection title="内在" hint="动机、秘密与成长弧决定这个人在压力下会怎么选。">
          <AiTextField
            ai={false}
            label="性格与行事逻辑"
            field="角色性格与行事逻辑"
            feature="character-card"
            novelId={novelId}
            value={draft.personality}
            onChange={(value) => update("personality", value)}
            rows={3}
            placeholder="他遇到压力时的第一反应是什么"
          />
          <AiTextField
            ai={false}
            label="目标"
            field="角色目标"
            feature="character-card"
            novelId={novelId}
            value={draft.goals}
            onChange={(value) => update("goals", value)}
            rows={2}
            placeholder="想要什么，愿意付出什么代价"
          />
          <AiTextField
            ai={false}
            label="秘密"
            field="角色秘密"
            feature="character-card"
            novelId={novelId}
            value={draft.secrets}
            onChange={(value) => update("secrets", value)}
            rows={2}
            placeholder="读者暂时不知道、但会影响行为的事"
          />
          <AiTextField
            ai={false}
            label="成长弧"
            field="角色成长弧"
            feature="character-card"
            novelId={novelId}
            value={draft.arc}
            onChange={(value) => update("arc", value)}
            rows={2}
            placeholder="从…变成…，转折点是什么"
          />
        </EditorSection>

        <EditorSection title="当前状态" hint="最近一章结束时的处境；故事档案会自动更新这里。">
          <AiTextField
            ai={false}
            label="当前状态"
            field="角色当前状态"
            feature="character-card"
            novelId={novelId}
            value={draft.currentState}
            onChange={(value) => update("currentState", value)}
            rows={2}
            placeholder="位置 / 伤势 / 心态 / 手上的东西"
          />
        </EditorSection>

        <EditorSection title="关系" hint="关系会影响 AI 写人物互动时的称呼、态度与站队。">
          <RelationsEditor
            relations={draft.relations}
            characters={characters}
            selfId={character?.id}
            title={null}
            onChange={(relations) => update("relations", relations)}
          />
        </EditorSection>

        <EditorSection title="标签" hint="用于筛选与速查，不进入正文。">
          <TagsInput value={draft.tags} onChange={(tags) => update("tags", tags)} placeholder="如：守夜人、剑客、关键人物" />
        </EditorSection>

        <EditorSection title="AI 可见性与揭示章节" hint="AI 默认只收到当前章节已揭示的可见资料；作者本轮明确 @ 引用时可例外提供。">
          <Switch
            checked={draft.aiVisible}
            onChange={(checked) => update("aiVisible", checked)}
            label="对 AI 可见"
            hint="关闭后，任何 AI 上下文都不会包含这个角色。"
          />
          <Select
            label="揭示章节"
            value={draft.revealAtChapter === null ? "" : String(draft.revealAtChapter)}
            onChange={(event) => update("revealAtChapter", event.target.value === "" ? null : Number(event.target.value))}
            options={chapterOptions}
            hint="留空 = 不按章节隐藏；填章节号后，当前章节到达该章前 AI 不会收到这张卡。无当前章节时默认隐藏，除非作者明确 @ 引用。"
          />
          <Switch checked={draft.pinned} onChange={(checked) => update("pinned", checked)} label="置顶" hint="置顶角色排在设定列表最前。" />
        </EditorSection>

        {detailApi.loading ? <p className="text-[11px] text-ink-3">正在获取角色最新详情…</p> : null}
      </CardEditorDocument>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="删除这个角色？"
        description={`「${character?.name ?? ""}」的角色卡会被删除，相关章节不会回滚，此操作不可撤销。`}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </>
  );

  if (presentation === "float") {
    return (
      <FloatWindow
        open={open}
        title={editing ? "编辑角色" : "新角色"}
        minimized={minimized}
        onMinimizedChange={setMinimized}
        onClose={onClose}
        className={confirmDeleteOpen ? "card-editor-window z-40" : "card-editor-window"}
        footer={footer}
      >
        {body}
      </FloatWindow>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "编辑角色" : "新建角色"} width={700} footer={footer}>
      {body}
    </Sheet>
  );
}
