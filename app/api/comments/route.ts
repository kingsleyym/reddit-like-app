import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('postId')
  const parentId = searchParams.get('parentId')

  try {
    const where = postId ? { postId } : parentId ? { parentId } : {}
    const comments = await prisma.comment.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, image: true } },
        replies: {
          include: {
            author: { select: { id: true, name: true, image: true } },
            _count: { select: { replies: true } }
          }
        },
        _count: { select: { votes: true } }
      },
      orderBy: { createdAt: 'asc' }
    })
    return NextResponse.json(comments)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { content, postId, parentId } = await request.json()
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const comment = await prisma.comment.create({
      data: {
        content,
        postId,
        parentId,
        authorId: user.id
      },
      include: {
        author: { select: { id: true, name: true, image: true } }
      }
    })
    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}