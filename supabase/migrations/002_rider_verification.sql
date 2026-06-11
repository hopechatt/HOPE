-- Add rider verification fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS id_photo_url text;

-- Create storage bucket for ID photos (run in Supabase SQL editor)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('id-photos', 'id-photos', true) ON CONFLICT DO NOTHING;

-- Storage policy: riders can upload their own ID
-- CREATE POLICY "Riders can upload own ID" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'id-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "Admins can view all IDs" ON storage.objects FOR SELECT USING (bucket_id = 'id-photos');

-- Update RLS for profiles: allow users to update their own is_verified only by admin
-- (Admin can update any profile)
