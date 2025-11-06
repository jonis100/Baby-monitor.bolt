/*
  # Add parent_count column to rooms table

  1. Changes
    - Add `parent_count` column to track number of connected parents
    - Add `sender_id` column to signaling_messages for device identification
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rooms' AND column_name = 'parent_count'
  ) THEN
    ALTER TABLE rooms ADD COLUMN parent_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signaling_messages' AND column_name = 'sender_id'
  ) THEN
    ALTER TABLE signaling_messages ADD COLUMN sender_id text;
  END IF;
END $$;
