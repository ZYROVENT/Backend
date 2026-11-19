CREATE TABLE IF NOT EXISTS public.user_achievements (
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    achievement_id text NOT NULL CHECK (achievement_id IN (
        'first_download',
        'first_launch',
        'melomano',
        'rey_del_pop',
        'socializer',
        'stylist',
        'configurator',
        'mod_hunter',
        'veteran',
        'explorer',
        'cleaner',
        'server_adder',
        'ram_master',
        'old_school',
        'bg_collector',
        'fullscreen_king',
        'modloader_expert',
        'safety_first'
    )),
    unlocked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.user_achievements FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.user_achievements TO service_role;
