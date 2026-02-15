'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface User {
  id: string
  name: string | null
  image: string | null
  karma: number
  createdAt: string
  _count: { posts: number; comments: number }
}

export default function UserPage() {
  const { id } = useParams()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      fetch(`/api/users/${id}`)
        .then(res => res.json())
        .then(setUser)
        .finally(() => setLoading(false))
    }
  }, [id])

  if (loading) return <div>Loading...</div>
  if (!user) return <div>User not found</div>

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="border rounded p-4">
        <h1 className="text-2xl font-bold">{user.name}</h1>
        <p>Karma: {user.karma}</p>
        <p>Posts: {user._count.posts}</p>
        <p>Comments: {user._count.comments}</p>
        <p>Joined: {new Date(user.createdAt).toLocaleDateString()}</p>
      </div>
    </div>
  )
}