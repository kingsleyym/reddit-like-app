interface Comment {
  id: string
  content: string
  author: { id: string; name: string | null; image: string | null }
  score: number
  createdAt: string
  parentId?: string | null
  replies: Comment[]
}