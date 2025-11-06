import { supabase } from './supabase';

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createRoom(): Promise<{ roomCode: string; roomId: string }> {
  const roomCode = generateRoomCode();

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      room_code: roomCode,
      baby_connected: false,
      parent_count: 0
    })
    .select('id, room_code')
    .single();

  if (error || !data) {
    throw new Error('Failed to create room');
  }

  return {
    roomCode: data.room_code,
    roomId: data.id
  };
}

export async function joinRoom(roomCode: string): Promise<string> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id')
    .eq('room_code', roomCode.toUpperCase())
    .maybeSingle();

  if (error || !data) {
    throw new Error('Room not found');
  }

  return data.id;
}

export async function updateRoomStatus(roomId: string, updates: {
  baby_connected?: boolean;
  parent_count?: number;
}) {
  await supabase
    .from('rooms')
    .update(updates)
    .eq('id', roomId);
}

export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if ('wakeLock' in navigator) {
      return await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    console.error('Wake Lock error:', err);
  }
  return null;
}

export function requestNotificationPermission(): Promise<NotificationPermission> {
  if ('Notification' in window) {
    return Notification.requestPermission();
  }
  return Promise.resolve('denied' as NotificationPermission);
}

export function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/vite.svg' });
  }
}
