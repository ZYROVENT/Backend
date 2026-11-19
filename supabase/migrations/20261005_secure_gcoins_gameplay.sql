ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS last_daily_reward_at timestamptz,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Disponible',
    ADD COLUMN IF NOT EXISTS show_online boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS allow_requests boolean NOT NULL DEFAULT true;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.friendships, public.messages FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.users, public.friendships, public.messages TO service_role;

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

    UPDATE public.users
    SET play_time_seconds = new_seconds,
        gcoins = new_balance
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'gcoins', new_balance,
        'play_time_seconds', new_seconds,
        'gcoins_earned', earned
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.spend_user_gcoins(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_balance bigint;
BEGIN
    IF p_amount IS NULL OR p_amount < 1 OR p_amount > 100000 THEN
        RAISE EXCEPTION 'INVALID_GCOIN_AMOUNT';
    END IF;

    UPDATE public.users
    SET gcoins = COALESCE(gcoins, 0) - p_amount
    WHERE id = p_user_id
      AND COALESCE(gcoins, 0) >= p_amount
    RETURNING gcoins INTO new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INSUFFICIENT_GCOINS';
    END IF;

    RETURN jsonb_build_object('gcoins', new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_gcoins(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_balance bigint;
    reward_time timestamptz := now();
BEGIN
    UPDATE public.users
    SET gcoins = COALESCE(gcoins, 0) + 50,
        last_daily_reward_at = reward_time
    WHERE id = p_user_id
      AND (
          last_daily_reward_at IS NULL
          OR last_daily_reward_at <= reward_time - interval '24 hours'
      )
    RETURNING gcoins INTO new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DAILY_REWARD_COOLDOWN';
    END IF;

    RETURN jsonb_build_object(
        'prize', 50,
        'new_balance', new_balance,
        'next_reward_at', reward_time + interval '24 hours'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.spin_gcoins_roulette(p_user_id uuid, p_prize integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_balance bigint;
BEGIN
    IF p_prize IS NULL OR p_prize NOT IN (0, 50, 100, 250) THEN
        RAISE EXCEPTION 'INVALID_ROULETTE_PRIZE';
    END IF;

    UPDATE public.users
    SET gcoins = COALESCE(gcoins, 0) - 100 + p_prize
    WHERE id = p_user_id
      AND COALESCE(gcoins, 0) >= 100
    RETURNING gcoins INTO new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INSUFFICIENT_GCOINS';
    END IF;

    RETURN jsonb_build_object('new_balance', new_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.record_gameplay_time(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spend_user_gcoins(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_daily_gcoins(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spin_gcoins_roulette(uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_gameplay_time(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_user_gcoins(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_gcoins(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.spin_gcoins_roulette(uuid, integer) TO service_role;
