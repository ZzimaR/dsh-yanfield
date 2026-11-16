import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"
import { gzipSync, gunzipSync } from "node:zlib"
import { ApiError } from "@/lib/api-utils"
import { MAX_BACKUP_FILE } from "@/lib/backup-format"

const plainHeader = Buffer.from("YANFIELD-1\n")
const encryptedHeader = Buffer.from("YANFIELD-1-ENCRYPTED\n")
const maxJsonBytes = 256 * 1024 * 1024
const saltBytes = 16
const nonceBytes = 12
const tagBytes = 16

export function invalidBackup(): ApiError {
  return new ApiError("备份文件损坏或数据不完整")
}

export function encodeBackup(value: unknown, password: string): Buffer {
  const json = JSON.stringify(value)
  if (Buffer.byteLength(json) > maxJsonBytes) throw new ApiError("备份文件过大，请分批导出作品", 413)
  const compressed = gzipSync(json)
  let file: Buffer
  if (password) {
    const salt = randomBytes(saltBytes)
    const nonce = randomBytes(nonceBytes)
    const cipher = createCipheriv("aes-256-gcm", scryptSync(password, salt, 32), nonce)
    cipher.setAAD(encryptedHeader)
    const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()])
    file = Buffer.concat([encryptedHeader, salt, nonce, cipher.getAuthTag(), ciphertext])
  } else {
    file = Buffer.concat([plainHeader, compressed])
  }
  if (file.length > MAX_BACKUP_FILE) throw new ApiError("备份文件过大，请分批导出作品", 413)
  return file
}

export function decodeBackup(file: Buffer, password: string): { value: unknown; encrypted: boolean } {
  if (file.length > MAX_BACKUP_FILE) throw new ApiError("备份文件过大，请分批导出作品", 413)
  const encrypted = file.subarray(0, encryptedHeader.length).equals(encryptedHeader)
  let compressed: Buffer
  if (encrypted) {
    if (!password) throw new ApiError("请输入此备份的密码")
    const saltEnd = encryptedHeader.length + saltBytes
    const nonceEnd = saltEnd + nonceBytes
    const tagEnd = nonceEnd + tagBytes
    if (file.length <= tagEnd) throw invalidBackup()
    try {
      const salt = file.subarray(encryptedHeader.length, saltEnd)
      const nonce = file.subarray(saltEnd, nonceEnd)
      const decipher = createDecipheriv("aes-256-gcm", scryptSync(password, salt, 32), nonce)
      decipher.setAAD(encryptedHeader)
      decipher.setAuthTag(file.subarray(nonceEnd, tagEnd))
      compressed = Buffer.concat([decipher.update(file.subarray(tagEnd)), decipher.final()])
    } catch {
      throw new ApiError("备份密码不正确，或文件已损坏")
    }
  } else {
    if (!file.subarray(0, plainHeader.length).equals(plainHeader)) {
      throw new ApiError("无法识别此备份格式，请确认文件由兼容版本的砚田导出")
    }
    compressed = file.subarray(plainHeader.length)
  }
  try {
    const json = gunzipSync(compressed, { maxOutputLength: maxJsonBytes })
    return { value: JSON.parse(json.toString("utf8")), encrypted }
  } catch {
    throw invalidBackup()
  }
}
