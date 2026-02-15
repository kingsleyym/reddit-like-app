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
          { title: { contains: search } },
          { content: { contains: search } }
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
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const post = await prisma.post.create({
      data: {
        title,
        content,
        authorId: user.id
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