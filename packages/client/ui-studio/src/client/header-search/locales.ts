/** `header-search` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'studio-header-search'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'search.trigger': '搜索工作区文件',
  'search.input': '搜索当前工作区…',
  'search.failed': '搜索失败：{message}',
  'search.noResults': '没有匹配结果',
  'search.truncated': '结果过多，已截断',
  'search.listAria': '工作区搜索结果',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<HeaderSearchKey, string> = {
  'search.trigger': 'Search workspace files',
  'search.input': 'Search the current workspace…',
  'search.failed': 'Search failed: {message}',
  'search.noResults': 'No matches',
  'search.truncated': 'Too many results; truncated',
  'search.listAria': 'Workspace search results',
}

/** Locale-key union for the header-search namespace (from the Chinese source of truth). */
export type HeaderSearchKey = keyof typeof zh
