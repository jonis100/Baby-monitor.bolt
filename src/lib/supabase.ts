import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Room = {
  id: string;
  room_code: string;
  baby_connected: boolean;
  parent_count: number;
  created_at: string;
  expires_at: string;
};

export type SignalingMessage = {
  id: string;
  room_id: string;
  sender_type: 'baby' | 'parent';
  sender_id: string;
  message_type: 'offer' | 'answer' | 'ice-candidate';
  payload: unknown;
  processed: boolean;
  created_at: string;
};
