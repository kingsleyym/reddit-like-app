import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sort = searchParams.get('sort') || 'new'
  const search = searchParams.get('search')

  try {
    let orderBy: any = { createdAt: 'desc' }
    if (sort === 'hot') {
      orderBy = [{ score: 'desc' }, { createdAt: 'desc' }]
    } else if (sort === 'top') {
      orderBy = { score: 'desc' }
    }

    const posts = await prisma.post.findMany({
      where: search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } }
        ]
      } : {},
      include: {
        author: { select: { id: true, name: true, image: true } },
        _count: { select: { comments: true } }
      },
      orderBy
    })
    return NextResponse.json(posts)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { title, content } = await request.json()
    const post = await prisma.post.create({
      data: {
        title,
        content,
        authorId: session.user.id
      },
      include: {
        author: { select: { id: true, name: true, image: true } }
      }
    })
    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
  }
}