'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'

export default function Header() {
  const { data: session } = useSession()

  return (
    <header className="bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold">Reddit-like</Link>
        <div>
          {session ? (
            <div className="flex items-center space-x-4">
              <span>Welcome, {session.user?.name}</span>
              <button onClick={() => signOut()} className="text-blue-500">Logout</button>
            </div>
          ) : (
            <div className="space-x-4">
              <Link href="/auth/signin" className="text-blue-500">Sign In</Link>
              <Link href="/auth/signup" className="text-blue-500">Sign Up</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}