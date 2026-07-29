import type { Review } from '@/types'

export function parseReviews(raw: string | undefined): Review[] {
  if (!raw || raw.trim() === '') return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item: Record<string, unknown>) => ({
        name: String(item.Name || item.name || ''),
        rating: Number(item.Rating || item.rating || 0),
        description: String(item.Description || item.description || item.text_original || ''),
        when: String(item.When || item.when || ''),
        profile_picture: item.ProfilePicture ? String(item.ProfilePicture) : undefined,
      }))
      .filter((r) => r.name || r.description)
  } catch {
    return []
  }
}
