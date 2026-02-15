'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface Post {
  id: string
  title: string
  content: string | null
  author: { id: string; name: string | null; image: string | null }
  authorId: string
  _count: { comments: number }
  score: number
  createdAt: string
}

export default function Home() {
  const { data: session } = useSession()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    fetch('/api/posts')
      .then(res => res.json())
      .then(setPosts)
      .finally(() => setLoading(false))
  }, [])

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content })
    })
    if (res.ok) {
      const newPost = await res.json()
      setPosts([newPost, ...posts])
      setTitle('')
      setContent('')
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Reddit-like App</h1>
      {session ? (
        <>
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-2">Create Post</h2>
            <form onSubmit={handleCreatePost} className="space-y-2">
              <input
                type="text"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 border rounded"
                required
              />
              <textarea
                placeholder="Content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full p-2 border rounded"
                rows={4}
              />
              <button type="submit" className="p-2 bg-blue-500 text-white rounded">
                Post
              </button>
            </form>
          </div>
        </>
      ) : (
        <p>Please <Link href="/auth/signin" className="text-blue-500">sign in</Link> to create posts.</p>
      )}
      <div className="space-y-4">
        {posts.map(post => (
          <div key={post.id} className="border rounded p-4">
            <Link href={`/posts/${post.id}`} className="text-xl font-semibold hover:underline">
              {post.title}
            </Link>
            <p>{post.content}</p>
            <div className="text-sm text-gray-600">
              by <Link href={`/users/${post.author.id}`} className="hover:underline">{post.author.name}</Link> • {post.score} points • {post._count.comments} comments
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}