import { bad, handle, ok } from "@/lib/api-utils";
import { splitChapters } from "@/app/api/_lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const POST = handle(async (request) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return bad("请使用 multipart/form-data 上传 txt 文件（字段名 file）");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("表单解析失败");
  }

  const file = form.get("file");
  if (file === null) return bad("缺少 file 字段");

  let text: string;
  if (typeof file === "string") {
    text = file;
  } else {
    if (file.size > MAX_FILE_BYTES) return bad("文件过大，最大支持 20MB");
    text = await file.text();
  }
  if (!text.trim()) return bad("文件内容为空");

  const regexRaw = form.get("regex");
  const customRegex = typeof regexRaw === "string" && regexRaw.trim() ? regexRaw.trim() : undefined;
  if (customRegex) {
    try {
      new RegExp(customRegex, "gm");
    } catch {
      return bad("章节分割正则无效");
    }
  }

  const chapters = splitChapters(text, customRegex);
  if (chapters.length === 0) return bad("未识别到任何章节");
  return ok({ chapters, total: chapters.length });
});
