"use client";

/**
 * 角色关系编辑：对角色 + 关系类型 + 说明
 */
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton, Input, Select } from "@/components/ui/kit";
import type { Character, CharacterRelation } from "@/lib/types";

export function RelationsEditor({
  relations,
  characters,
  selfId,
  title = "人物关系",
  onChange,
}: {
  relations: CharacterRelation[];
  characters: Character[];
  selfId?: string;
  /** 传 null 时不再渲染标题行（调用方已有分组标题时用） */
  title?: React.ReactNode;
  onChange: (relations: CharacterRelation[]) => void;
}) {
  const candidates = characters.filter((character) => character.id !== selfId);

  const update = (index: number, patch: Partial<CharacterRelation>) => {
    onChange(relations.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        {title === null ? null : <span className="text-[12.5px] font-medium text-ink-2">{title}</span>}
        <Button
          variant="subtle"
          size="sm"
          icon={<Plus className="size-3.5" />}
          disabled={candidates.length === 0}
          onClick={() => onChange([...relations, { targetId: candidates[0]?.id ?? "", relation: "", note: "" }])}
        >
          添加关系
        </Button>
      </div>

      {relations.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-[12px] leading-relaxed text-ink-3">
          还没有关系。关系会影响 AI 写人物互动时的称呼与态度。
        </p>
      ) : (
        <div className="space-y-2">
          {relations.map((relation, index) => {
            // 旧数据里可能存着已经不在角色表里的名字，补一个只读选项，避免下拉框显示为空
            const options = candidates.map((character) => ({ value: character.id, label: character.name }));
            if (relation.targetId && !candidates.some((character) => character.id === relation.targetId)) {
              options.unshift({ value: relation.targetId, label: `${relation.targetId}（未建卡）` });
            }
            return (
              <div key={`${relation.targetId}-${index}`} className="rounded-md border border-line bg-surface-2/50 p-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-[42%] shrink-0">
                    <Select
                      className="h-8 text-[12.5px]"
                      value={relation.targetId}
                      onChange={(event) => update(index, { targetId: event.target.value })}
                      options={options}
                      placeholder="对角色"
                    />
                  </div>
                  <Input
                    value={relation.relation}
                    placeholder="关系类型：师徒 / 宿敌"
                    className="h-8 flex-1 text-[12.5px]"
                    onChange={(event) => update(index, { relation: event.target.value })}
                  />
                  <IconButton label="删除关系" size="sm" onClick={() => onChange(relations.filter((_, i) => i !== index))}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
                <Input
                  value={relation.note}
                  placeholder="补充说明（可空）"
                  className="mt-1.5 h-8 text-[12.5px]"
                  onChange={(event) => update(index, { note: event.target.value })}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
