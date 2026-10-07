ALTER TABLE public.cosmetic_catalog
    ADD COLUMN IF NOT EXISTS sticker_config jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'cosmetic_catalog_sticker_config_object'
          AND conrelid = 'public.cosmetic_catalog'::regclass
    ) THEN
        ALTER TABLE public.cosmetic_catalog
            ADD CONSTRAINT cosmetic_catalog_sticker_config_object
            CHECK (jsonb_typeof(sticker_config) = 'object');
    END IF;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'cosmetic-stickers',
    'cosmetic-stickers',
    true,
    5242880,
    ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can read cosmetic stickers" ON storage.objects;
CREATE POLICY "Public can read cosmetic stickers"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'cosmetic-stickers');
