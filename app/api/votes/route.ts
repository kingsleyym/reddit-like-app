import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { postId, commentId, value } = await request.json() // value: 1 or -1
    const userId = session.user.id

    // Upsert vote
    const vote = await prisma.vote.upsert({
      where: postId ? { userId_postId: { userId, postId } } : { userId_commentId: { userId, commentId } },
      update: { value },
      create: {
        userId,
        postId,
        commentId,
        value
      }
    })

    // Update scores
    if (postId) {
      await updatePostScore(postId)
    } else if (commentId) {
      await updateCommentScore(commentId)
    }

    return NextResponse.json(vote, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to vote' }, { status: 500 })
  }
}

async function updatePostScore(postId: string) {
  const upvotes = await prisma.vote.count({ where: { postId, value: 1 } })
  const downvotes = await prisma.vote.count({ where: { postId, value: -1 } })
  const score = upvotes - downvotes
  await prisma.post.update({
    where: { id: postId },
    data: { upvotes, downvotes, score }
  })

  // Update author karma (simplified: +1 for upvote, -1 for downvote)
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } })
  if (post) {
    const karmaChange = upvotes - downvotes // net karma from this post
    await prisma.user.update({
      where: { id: post.authorId },
      data: { karma: { increment: karmaChange } }
    })
  }
}

async function updateCommentScore(commentId: string) {
  const upvotes = await prisma.vote.count({ where: { commentId, value: 1 } })
  const downvotes = await prisma.vote.count({ where: { commentId, value: -1 } })
  const score = upvotes - downvotes
  await prisma.comment.update({
    where: { id: commentId },
    data: { upvotes, downvotes, score }
  })

  // Update author karma
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { authorId: true } })
  if (comment) {
    const karmaChange = upvotes - downvotes
    await prisma.user.update({
      where: { id: comment.authorId },
      data: { karma: { increment: karmaChange } }
    })
  }
}