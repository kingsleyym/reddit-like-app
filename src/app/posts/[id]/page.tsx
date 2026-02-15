'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface Post {
  id: string
  title: string
  content: string | null
  author: { id: string; name: string | null; image: string | null }
  score: number
  createdAt: string
}

interface Comment {
  id: string
  content: string
  author: { id: string; name: string | null; image: string | null }
  score: number
  createdAt: string
  replies: Comment[]
}

export default function PostPage() {
  const { id } = useParams()
  const { data: session } = useSession()
  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [commentContent, setCommentContent] = useState('')

  useEffect(() => {
    if (id) {
      fetch(`/api/posts/${id}`)
        .then(res => res.json())
        .then(setPost)
      fetch(`/api/comments?postId=${id}`)
        .then(res => res.json())
        .then(setComments)
        .finally(() => setLoading(false))
    }
  }, [id])

  const handleVote = async (type: 'post' | 'comment', itemId: string, value: number) => {
    await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [type === 'post' ? 'postId' : 'commentId']: itemId, value })
    })
    // Refresh data
    window.location.reload()
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: commentContent, postId: id })
    })
    if (res.ok) {
      setCommentContent('')
      // Refresh comments
      fetch(`/api/comments?postId=${id}`)
        .then(res => res.json())
        .then(setComments)
    }
  }

  if (loading) return <div>Loading...</div>
  if (!post) return <div>Post not found</div>

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="border rounded p-4 mb-4">
        <h1 className="text-2xl font-bold">{post.title}</h1>
        <p>{post.content}</p>
        <div className="text-sm text-gray-600">
          by <Link href={`/users/${post.author.id}`} className="hover:underline">{post.author.name}</Link> • {post.score} points
        </div>
        {session && (
          <div>
            <button onClick={() => handleVote('post', post.id, 1)} className="mr-2">Upvote</button>
            <button onClick={() => handleVote('post', post.id, -1)}>Downvote</button>
          </div>
        )}
      </div>
      {session && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">Add Comment</h2>
          <form onSubmit={handleComment} className="space-y-2">
            <textarea
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              className="w-full p-2 border rounded"
              rows={4}
              required
            />
            <button type="submit" className="p-2 bg-blue-500 text-white rounded">
              Comment
            </button>
          </form>
        </div>
      )}
      <div>
        <h2 className="text-xl font-semibold mb-2">Comments</h2>
        {comments.map(comment => (
          <div key={comment.id} className="border-l-2 pl-4 mb-2">
            <p>{comment.content}</p>
            <div className="text-sm text-gray-600">
              by <Link href={`/users/${comment.author.id}`} className="hover:underline">{comment.author.name}</Link> • {comment.score} points
            </div>
            {session && (
              <div>
                <button onClick={() => handleVote('comment', comment.id, 1)} className="mr-2">Upvote</button>
                <button onClick={() => handleVote('comment', comment.id, -1)}>Downvote</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}