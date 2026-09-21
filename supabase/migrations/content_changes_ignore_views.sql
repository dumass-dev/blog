-- Migration: Ignore views and updated_at changes in fn_notify_content_change trigger function
-- Prevents view increments from flooding content_changes or broadcasting via Realtime

CREATE OR REPLACE FUNCTION public.fn_notify_content_change()
RETURNS TRIGGER AS $$
DECLARE
    v_row_id UUID;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        -- If subtracting 'views' and 'updated_at' leaves OLD and NEW identical, ignore the UPDATE
        IF (to_jsonb(OLD) - 'views' - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(NEW) - 'views' - 'updated_at') THEN
            RETURN NULL;
        END IF;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        v_row_id := OLD.id;
    ELSE
        v_row_id := NEW.id;
    END IF;

    INSERT INTO public.content_changes (table_name, row_id, op, changed_at)
    VALUES (TG_TABLE_NAME, v_row_id, TG_OP, NOW());

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
