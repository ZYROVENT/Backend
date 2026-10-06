CREATE TABLE IF NOT EXISTS public.user_progression (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    xp bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_level_reward_claims (
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    level integer NOT NULL CHECK (level >= 5 AND level % 5 = 0),
    item_id text NOT NULL,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, level)
);

CREATE TABLE IF NOT EXISTS public.user_cosmetics (
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    item_id text NOT NULL,
    source text NOT NULL CHECK (source IN ('shop', 'level_reward')),
    acquired_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
);

ALTER TABLE public.user_progression ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_level_reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cosmetics ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.user_progression, public.user_level_reward_claims, public.user_cosmetics
    FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.user_progression, public.user_level_reward_claims, public.user_cosmetics
    TO service_role;

INSERT INTO public.user_progression (user_id, xp)
SELECT
    users.id,
    GREATEST(COALESCE(users.play_time_seconds, 0), 0) / 60
        + COALESCE(achievements.achievement_count, 0) * 25
FROM public.users AS users
LEFT JOIN (
    SELECT user_id, COUNT(*) AS achievement_count
    FROM public.user_achievements
    GROUP BY user_id
) AS achievements ON achievements.user_id = users.id
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.grant_achievement_progression_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_progression (user_id, xp)
    VALUES (NEW.user_id, 25)
    ON CONFLICT (user_id) DO UPDATE
    SET xp = public.user_progression.xp + 25,
        updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_achievements_grant_progression_xp ON public.user_achievements;
CREATE TRIGGER user_achievements_grant_progression_xp
AFTER INSERT ON public.user_achievements
FOR EACH ROW
EXECUTE FUNCTION public.grant_achievement_progression_xp();

CREATE OR REPLACE FUNCTION public.record_gameplay_time(p_user_id uuid, p_seconds integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    old_seconds bigint;
    new_seconds bigint;
    earned bigint;
    new_balance bigint;
    xp_earned bigint;
    total_xp bigint;
BEGIN
    IF p_seconds IS NULL OR p_seconds < 1 OR p_seconds > 30 THEN
        RAISE EXCEPTION 'INVALID_GAMEPLAY_INTERVAL';
    END IF;

    SELECT COALESCE(play_time_seconds, 0), COALESCE(gcoins, 0)
    INTO old_seconds, new_balance
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;

    new_seconds := old_seconds + p_seconds;
    earned := (new_seconds / 600 - old_seconds / 600) * 50;
    new_balance := new_balance + earned;
    xp_earned := new_seconds / 60 - old_seconds / 60;

    INSERT INTO public.user_progression (user_id, xp)
    VALUES (p_user_id, xp_earned)
    ON CONFLICT (user_id) DO UPDATE
    SET xp = public.user_progression.xp + EXCLUDED.xp,
        updated_at = now()
    RETURNING xp INTO total_xp;

    UPDATE public.users
    SET play_time_seconds = new_seconds,
        gcoins = new_balance
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'gcoins', new_balance,
        'play_time_seconds', new_seconds,
        'gcoins_earned', earned,
        'xp', total_xp,
        'xp_earned', xp_earned
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_level_cosmetic(p_user_id uuid, p_level integer, p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_xp bigint;
    current_level integer;
    claimed_levels integer[];
BEGIN
    IF p_level IS NULL OR p_level < 5 OR p_level % 5 <> 0 THEN
        RAISE EXCEPTION 'INVALID_REWARD_LEVEL';
    END IF;

    IF p_item_id IS NULL OR p_item_id NOT IN (
        'bubble_fire', 'bubble_ice', 'bubble_neon', 'bubble_dark',
        'bubble_pixel', 'bubble_rgb', 'bubble_glass', 'bubble_cloud',
        'tag_pro', 'tag_vip', 'tag_glitch',
        'badge_miner', 'badge_ender', 'badge_music'
    ) THEN
        RAISE EXCEPTION 'INVALID_COSMETIC';
    END IF;

    INSERT INTO public.user_progression (user_id, xp)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT xp INTO total_xp
    FROM public.user_progression
    WHERE user_id = p_user_id
    FOR UPDATE;

    current_level := (total_xp / 100)::integer + 1;
    IF current_level < p_level THEN
        RAISE EXCEPTION 'LEVEL_REWARD_NOT_EARNED';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.user_cosmetics
        WHERE user_id = p_user_id AND item_id = p_item_id
    ) THEN
        RAISE EXCEPTION 'COSMETIC_ALREADY_OWNED';
    END IF;

    INSERT INTO public.user_level_reward_claims (user_id, level, item_id)
    VALUES (p_user_id, p_level, p_item_id);

    INSERT INTO public.user_cosmetics (user_id, item_id, source)
    VALUES (p_user_id, p_item_id, 'level_reward');

    SELECT COALESCE(array_agg(level ORDER BY level), ARRAY[]::integer[])
    INTO claimed_levels
    FROM public.user_level_reward_claims
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'xp', total_xp,
        'level', current_level,
        'reward_level', p_level,
        'item_id', p_item_id,
        'claimed_reward_levels', claimed_levels
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_shop_cosmetic(p_user_id uuid, p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item_price integer;
    new_balance bigint;
BEGIN
    item_price := CASE p_item_id
        WHEN 'bubble_fire' THEN 150
        WHEN 'bubble_ice' THEN 150
        WHEN 'bubble_neon' THEN 300
        WHEN 'bubble_dark' THEN 500
        WHEN 'bubble_pixel' THEN 250
        WHEN 'bubble_rgb' THEN 450
        WHEN 'bubble_glass' THEN 350
        WHEN 'bubble_cloud' THEN 200
        WHEN 'tag_pro' THEN 200
        WHEN 'tag_vip' THEN 400
        WHEN 'tag_glitch' THEN 600
        WHEN 'badge_miner' THEN 100
        WHEN 'badge_ender' THEN 250
        WHEN 'badge_music' THEN 150
        ELSE NULL
    END;

    IF item_price IS NULL THEN
        RAISE EXCEPTION 'INVALID_COSMETIC';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.user_cosmetics
        WHERE user_id = p_user_id AND item_id = p_item_id
    ) THEN
        RAISE EXCEPTION 'COSMETIC_ALREADY_OWNED';
    END IF;

    UPDATE public.users
    SET gcoins = COALESCE(gcoins, 0) - item_price
    WHERE id = p_user_id
      AND COALESCE(gcoins, 0) >= item_price
    RETURNING gcoins INTO new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INSUFFICIENT_GCOINS';
    END IF;

    INSERT INTO public.user_cosmetics (user_id, item_id, source)
    VALUES (p_user_id, p_item_id, 'shop');

    RETURN jsonb_build_object(
        'gcoins', new_balance,
        'item_id', p_item_id,
        'price', item_price
    );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_achievement_progression_xp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_gameplay_time(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_level_cosmetic(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_shop_cosmetic(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_gameplay_time(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_level_cosmetic(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.purchase_shop_cosmetic(uuid, text) TO service_role;
