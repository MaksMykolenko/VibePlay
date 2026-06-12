import type { NotificationType, PrismaClient } from '@vibeplay/database';

export async function notify(
  prisma: PrismaClient,
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  metadata: Record<string, string> = {},
): Promise<void> {
  await prisma.notification.create({
    data: { userId, type, title, body, metadata },
  });
}
