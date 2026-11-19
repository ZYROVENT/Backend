CREATE TABLE IF NOT EXISTS public.cosmetic_catalog (
    item_id text PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('bubble', 'nametag', 'badge')),
    price integer NOT NULL CHECK (price >= 0),
    icon text NOT NULL,
    description text NOT NULL,
    css_code text NOT NULL DEFAULT '' CHECK (length(css_code) <= 12000),
    enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cosmetic_catalog
    ADD COLUMN IF NOT EXISTS css_code text NOT NULL DEFAULT '' CHECK (length(css_code) <= 12000);

INSERT INTO public.cosmetic_catalog (item_id, name, type, price, icon, description, css_code)
VALUES
    ('bubble_fire', 'Burbuja de Fuego', 'bubble', 150, '🔥', 'Llamas ardientes con pulso de calor continuo', 'background: linear-gradient(135deg, #ff0844, #ffb199); border: 1px solid #ff4b1f; border-radius: 16px 16px 2px 16px; color: #ffffff; box-shadow: 0 0 16px rgba(255, 75, 31, 0.7);'),
    ('bubble_ice', 'Burbuja Helada', 'bubble', 150, '❄️', 'Bordes gélidos angulares con resplandor cian', 'background: linear-gradient(135deg, rgba(0, 242, 254, 0.85), rgba(79, 172, 254, 0.9)); border: 1.5px solid #ffffff; border-radius: 4px 18px; color: #003366; box-shadow: 0 0 14px rgba(79, 172, 254, 0.7);'),
    ('bubble_neon', 'Burbuja Neón', 'bubble', 300, '⚡', 'Luz cyberpunk animada con destellos morado/cian', 'background: rgba(10, 10, 24, 0.95); border: 2px solid #00f0ff; border-radius: 14px; color: #00f0ff; box-shadow: 0 0 15px rgba(0, 240, 255, 0.6), inset 0 0 8px rgba(0, 240, 255, 0.3);'),
    ('bubble_dark', 'Burbuja Sombría', 'bubble', 500, '🌌', 'Vórtice cósmico con partículas púrpuras', 'background: linear-gradient(135deg, #1f0036, #65008b); border: 1.5px solid #d500f9; border-radius: 18px 4px 18px 14px; color: #f3e5f5; box-shadow: 0 0 18px rgba(213, 0, 249, 0.65);'),
    ('bubble_pixel', 'Burbuja 8-Bit Pixel', 'bubble', 250, '🟩', 'Diseño retro cuadrado estilo bloque de Minecraft', 'background: #1e1e1e; border: 3px solid #00ff66; border-radius: 0; color: #00ff66; font-family: monospace; box-shadow: 4px 4px 0 #008833;'),
    ('bubble_rgb', 'Burbuja Gamer RGB', 'bubble', 450, '🌈', 'Borde con gradiente cromático giratorio', 'background: linear-gradient(135deg, #7a00ff, #ff00c8); border: 2px solid #ff00c8; border-radius: 16px; color: #ffffff; box-shadow: 0 0 16px rgba(255, 0, 200, 0.65);'),
    ('bubble_glass', 'Burbuja Glassmorphism', 'bubble', 350, '💎', 'Cristal translúcido ultra moderno con desenfoque', 'background: rgba(255, 255, 255, 0.15); border: 1.5px solid rgba(255, 255, 255, 0.45); border-radius: 20px 20px 20px 4px; color: #ffffff; backdrop-filter: blur(15px); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);'),
    ('bubble_cloud', 'Burbuja Nubecita', 'bubble', 200, '☁️', 'Forma suave y esponjosa de alta visibilidad', 'background: linear-gradient(180deg, #ffffff, #dbe9f6); border: 2px solid #b8d5ed; border-radius: 24px; color: #1e3a5f; box-shadow: 0 6px 16px rgba(184, 213, 237, 0.4); font-weight: 800;'),
    ('tag_pro', 'Etiqueta [PRO]', 'nametag', 200, '⭐', 'Muestra un título dorado sobre tu nombre', ''),
    ('tag_vip', 'Etiqueta [VIP]', 'nametag', 400, '👑', 'Corona resplandeciente en tu etiqueta', ''),
    ('tag_glitch', 'Etiqueta [GLITCH]', 'nametag', 600, '👾', 'Efecto matrix animado sobre tu apodo', ''),
    ('badge_miner', 'Insignia Diamante', 'badge', 100, '💎', 'Emblema de minero maestro para tu perfil', ''),
    ('badge_ender', 'Ojo de Ender', 'badge', 250, '👁️', 'Insignia mística del End en tu tarjeta', ''),
    ('badge_music', 'Nota Musical', 'badge', 150, '🎵', 'Insignia exclusiva para amantes de GMusic', '')
ON CONFLICT (item_id) DO UPDATE
SET css_code = EXCLUDED.css_code,
    updated_at = now()
WHERE public.cosmetic_catalog.css_code = ''
  AND public.cosmetic_catalog.type = 'bubble';

ALTER TABLE public.user_cosmetics
    ADD COLUMN IF NOT EXISTS equipped boolean NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'cosmetic_catalog_item_type_key'
          AND conrelid = 'public.cosmetic_catalog'::regclass
    ) THEN
        ALTER TABLE public.cosmetic_catalog
            ADD CONSTRAINT cosmetic_catalog_item_type_key UNIQUE (item_id, type);
    END IF;
END;
$$;

ALTER TABLE public.user_cosmetics
    ADD COLUMN IF NOT EXISTS item_type text;

UPDATE public.user_cosmetics AS owned
SET item_type = catalog.type
FROM public.cosmetic_catalog AS catalog
WHERE owned.item_id = catalog.item_id
  AND owned.item_type IS NULL;

ALTER TABLE public.user_cosmetics
    ALTER COLUMN item_type SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_cosmetics_item_id_fkey'
          AND conrelid = 'public.user_cosmetics'::regclass
    ) THEN
        ALTER TABLE public.user_cosmetics
            ADD CONSTRAINT user_cosmetics_item_id_fkey
            FOREIGN KEY (item_id) REFERENCES public.cosmetic_catalog(item_id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_cosmetics_item_type_fkey'
          AND conrelid = 'public.user_cosmetics'::regclass
    ) THEN
        ALTER TABLE public.user_cosmetics
            ADD CONSTRAINT user_cosmetics_item_type_fkey
            FOREIGN KEY (item_id, item_type)
            REFERENCES public.cosmetic_catalog(item_id, type)
            ON UPDATE CASCADE
            ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS user_cosmetics_one_equipped_per_type
    ON public.user_cosmetics (user_id, item_type)
    WHERE equipped;

ALTER TABLE public.cosmetic_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.cosmetic_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cosmetic_catalog TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.cosmetic_catalog TO service_role;

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
    SELECT price INTO item_price
    FROM public.cosmetic_catalog
    WHERE item_id = p_item_id AND enabled;

    IF NOT FOUND THEN
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

    INSERT INTO public.user_cosmetics (user_id, item_id, item_type, source)
    SELECT p_user_id, item_id, type, 'shop'
    FROM public.cosmetic_catalog
    WHERE item_id = p_item_id;

    RETURN jsonb_build_object(
        'gcoins', new_balance,
        'item_id', p_item_id,
        'price', item_price
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

    IF NOT EXISTS (
        SELECT 1 FROM public.cosmetic_catalog
        WHERE item_id = p_item_id AND enabled
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

    INSERT INTO public.user_cosmetics (user_id, item_id, item_type, source)
    SELECT p_user_id, item_id, type, 'level_reward'
    FROM public.cosmetic_catalog
    WHERE item_id = p_item_id;

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

CREATE OR REPLACE FUNCTION public.set_user_equipped_cosmetic(
    p_user_id uuid,
    p_type text,
    p_item_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item_type text;
BEGIN
    IF p_type IS NULL OR p_type NOT IN ('bubble', 'nametag', 'badge') THEN
        RAISE EXCEPTION 'INVALID_COSMETIC_TYPE';
    END IF;

    IF p_item_id IS NOT NULL THEN
        SELECT owned.item_type INTO item_type
        FROM public.cosmetic_catalog AS catalog
        JOIN public.user_cosmetics AS owned
          ON owned.item_id = catalog.item_id
         AND owned.item_type = catalog.type
        WHERE owned.user_id = p_user_id
          AND catalog.item_id = p_item_id
          AND catalog.enabled;

        IF item_type IS NULL THEN
            RAISE EXCEPTION 'COSMETIC_NOT_OWNED';
        END IF;
        IF item_type <> p_type THEN
            RAISE EXCEPTION 'INVALID_COSMETIC_TYPE';
        END IF;
    END IF;

    UPDATE public.user_cosmetics AS owned
    SET equipped = false
    WHERE owned.user_id = p_user_id
      AND owned.item_type = p_type
      AND owned.equipped;

    IF p_item_id IS NOT NULL THEN
        UPDATE public.user_cosmetics
        SET equipped = true
        WHERE user_id = p_user_id AND item_id = p_item_id;
    END IF;

    RETURN jsonb_build_object('type', p_type, 'item_id', p_item_id);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_shop_cosmetic(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_level_cosmetic(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_equipped_cosmetic(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_shop_cosmetic(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_level_cosmetic(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_equipped_cosmetic(uuid, text, text) TO service_role;
