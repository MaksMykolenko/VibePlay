import { useCallback, useEffect, useState } from 'react';
import type { NotificationDto } from '@vibeplay/shared';
import { api } from '../lib/api';
import type { Notification, NotificationType } from '../types';

function notificationType(type: NotificationDto['type']): NotificationType {
  switch (type) {
    case 'GAME_APPROVED':
      return 'game_approved';
    case 'GAME_REJECTED':
    case 'GAME_VALIDATION_FAILED':
      return 'game_rejected';
    case 'NEW_COMMENT':
      return 'new_comment';
    case 'GAME_READY_FOR_REVIEW':
      return 'moderation_message';
    default:
      return 'platform_announcement';
  }
}

function toNotification(dto: NotificationDto, userId: string): Notification {
  return {
    id: dto.id,
    userId,
    type: notificationType(dto.type),
    title: dto.title,
    message: dto.body,
    isRead: dto.readAt !== null,
    timestamp: dto.createdAt,
    relatedSlug: dto.metadata.slug,
  };
}

export const useNotifications = (userId: string | undefined) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    const items = await api.listNotifications();
    setNotifications(items.map((item) => toNotification(item, userId)));
  }, [userId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadNotifications(), 0);
    const interval = window.setInterval(() => void loadNotifications(), 30_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  const markAsRead = (id: string) => {
    setNotifications((items) =>
      items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
    void api.markNotificationRead(id).catch(() => void loadNotifications());
  };

  const markAllAsRead = () => {
    setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
    void api.markAllNotificationsRead().catch(() => void loadNotifications());
  };

  return {
    notifications,
    unreadCount: notifications.filter((notification) => !notification.isRead).length,
    markAsRead,
    markAllAsRead,
  };
};
