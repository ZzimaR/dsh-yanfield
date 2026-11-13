import { bad, handle, notFound } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import {
  asExportFormat,
  asExportScope,
  buildExport,
  buildExportResponse,
  type ExportVolumeGroup,
} from "@/app/api/_lib/export";
import { queryParam } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle<{ novelId: string }>(async (request, { params }) => {
  const tree = repo.getNovelTree(params.novelId);
  if (!tree) return notFound("作品不存在");

  const formatRaw = queryParam(request, "format");
  const scopeRaw = queryParam(request, "scope");
  if (formatRaw && formatRaw !== "md" && formatRaw !== "txt") {
    return bad("format 仅支持 md 或 txt");
  }
  if (scopeRaw && scopeRaw !== "book" && scopeRaw !== "volume" && scopeRaw !== "chapter") {
    return bad("scope 仅支持 book、volume 或 chapter");
  }
  const format = asExportFormat(formatRaw);
  const scope = asExportScope(scopeRaw);
  const id = queryParam(request, "id");

  const volumes: ExportVolumeGroup[] = tree.volumes.map((item) => ({
    volume: item,
    chapters: item.chapters,
  }));

  if (scope === "book") {
    return buildExportResponse(
      buildExport({ novel: tree.novel, format, scope, volumes, looseChapters: tree.looseChapters }),
    );
  }

  if (!id) {
    return bad(scope === "volume" ? "导出分卷需要提供 id（卷 ID）" : "导出单章需要提供 id（章节 ID）");
  }

  if (scope === "volume") {
    const volume = tree.volumes.find((item) => item.id === id);
    if (!volume) return notFound("卷不存在");
    return buildExportResponse(
      buildExport({
        novel: tree.novel,
        format,
        scope,
        volumes: [{ volume, chapters: volume.chapters }],
        looseChapters: [],
      }),
    );
  }

  const chapter = volumes.flatMap((group) => group.chapters).find((item) => item.id === id);
  if (chapter) {
    return buildExportResponse(
      buildExport({ novel: tree.novel, format, scope, volumes: [], looseChapters: [chapter] }),
    );
  }
  const loose = tree.looseChapters.find((item) => item.id === id);
  if (!loose) return notFound("章节不存在");
  return buildExportResponse(
    buildExport({ novel: tree.novel, format, scope, volumes: [], looseChapters: [loose] }),
  );
});
