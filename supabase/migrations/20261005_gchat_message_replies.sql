ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reply_to_username text,
    ADD COLUMN IF NOT EXISTS reply_to_message text;
