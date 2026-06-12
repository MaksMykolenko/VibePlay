import { useState, useEffect } from 'react';
import type { Notification, NotificationType } from '../types';
import { mockNotifications } from '../data/mockNotifications';

function readNotifications(userId: string | undefined): Notification[] {
  if (!userId) return [];
  const stored = localStorage.getItem('vibeplay_notifications');
  let parsed: Notification[] = [];
  if (stored) {
    try {
      parsed = JSON.parse(stored);
    } catch (error) {
      console.error(error);
    }
  } else {
    parsed = mockNotifications;
    localStorage.setItem('vibeplay_notifications', JSON.stringify(mockNotifications));
  }
  return parsed.filter((notification) => notification.userId === userId);
}

export const useNotifications = (userId: string | undefined) => {
  const [notifications, setNotifications] = useState<Notification[]>(() =>
    readNotifications(userId),
  );
  const [unreadCount, setUnreadCount] = useState(
    () => readNotifications(userId).filter((notification) => !notification.isRead).length,
  );

  useEffect(() => {
    const loadNotifications = () => {
      const userNotifs = readNotifications(userId);
      setNotifications(userNotifs);
      setUnreadCount(userNotifs.filter((n) => !n.isRead).length);
    };

    const initialLoad = window.setTimeout(loadNotifications, 0);
    const interval = setInterval(loadNotifications, 1000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [userId]);

  const markAsRead = (id: string) => {
    const stored = localStorage.getItem('vibeplay_notifications');
    if (!stored) return;
    try {
      const allNotifs: Notification[] = JSON.parse(stored);
      const updated = allNotifs.map((n) => (n.id === id ? { ...n, isRead: true } : n));
      localStorage.setItem('vibeplay_notifications', JSON.stringify(updated));

      if (userId) {
        const userNotifs = updated.filter((n) => n.userId === userId);
        setNotifications(userNotifs);
        setUnreadCount(userNotifs.filter((n) => !n.isRead).length);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const markAllAsRead = () => {
    if (!userId) return;
    const stored = localStorage.getItem('vibeplay_notifications');
    if (!stored) return;
    try {
      const allNotifs: Notification[] = JSON.parse(stored);
      const updated = allNotifs.map((n) => (n.userId === userId ? { ...n, isRead: true } : n));
      localStorage.setItem('vibeplay_notifications', JSON.stringify(updated));

      const userNotifs = updated.filter((n) => n.userId === userId);
      setNotifications(userNotifs);
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  const addNotification = (
    targetUserId: string,
    type: NotificationType,
    title: string,
    message: string,
    relatedSlug?: string,
  ) => {
    const stored = localStorage.getItem('vibeplay_notifications');
    const allNotifs: Notification[] = stored ? JSON.parse(stored) : [];

    const newNotif: Notification = {
      id: `notif_${Date.now()}`,
      userId: targetUserId,
      type,
      title,
      message,
      isRead: false,
      timestamp: new Date().toISOString(),
      relatedSlug,
    };

    const updated = [newNotif, ...allNotifs];
    localStorage.setItem('vibeplay_notifications', JSON.stringify(updated));

    if (userId === targetUserId) {
      const userNotifs = updated.filter((n) => n.userId === userId);
      setNotifications(userNotifs);
      setUnreadCount(userNotifs.filter((n) => !n.isRead).length);
    }
  };

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    addNotification,
  };
};
