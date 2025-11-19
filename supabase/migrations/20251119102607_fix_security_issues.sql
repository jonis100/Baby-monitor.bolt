/*
  # Fix Security Issues
  
  1. Changes
    - Drop unused index `idx_rooms_expires_at` on rooms table
    - Recreate `cleanup_expired_rooms` function with immutable search_path
  
  2. Security
    - Removes unused index to reduce maintenance overhead
    - Fixes function search_path vulnerability by setting a secure, immutable search_path
  
  3. Important Notes
    - The cleanup_expired_rooms function now has a secure search_path that prevents search_path manipulation attacks
    - The expires_at index was unused and can be safely removed
*/

-- Drop unused index
DROP INDEX IF EXISTS idx_rooms_expires_at;

-- Recreate cleanup_expired_rooms function with secure search_path
DROP FUNCTION IF EXISTS cleanup_expired_rooms();

CREATE OR REPLACE FUNCTION cleanup_expired_rooms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM rooms WHERE expires_at < now();
END;
$$;