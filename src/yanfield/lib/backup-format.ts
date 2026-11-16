export const BACKUP_EXTENSION = ".yanfield"
export const MAX_BACKUP_FILE = 31 * 1024 * 1024

export interface BackupBook {
  id: string
  title: string
  chapters: number
  notes: number
  conversations: number
  existing?: boolean
}

export interface BackupPreferences {
  global?: Record<string, string>
  books?: Record<string, Record<string, string>>
}

export interface BackupPreview {
  scope: "all" | "books"
  createdAt: string
  books: BackupBook[]
  localBooks: number
  includesKeys: boolean
  fingerprint: string
}

export interface BackupImportResult {
  books: number
  recoveryFile?: string
  preferences: BackupPreferences
}
