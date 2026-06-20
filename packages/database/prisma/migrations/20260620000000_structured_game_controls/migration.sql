-- Convert legacy free-form control strings into structured, creator-editable rows.
-- Keep the original text in `keys` so existing game instructions remain visible.
ALTER TABLE "Game"
ADD COLUMN "controls_json" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "Game"
SET "controls_json" = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object('action', '', 'keys', control_value)
      ORDER BY control_order
    )
    FROM unnest("Game"."controls") WITH ORDINALITY AS legacy(control_value, control_order)
  ),
  '[]'::jsonb
);

ALTER TABLE "Game" DROP COLUMN "controls";
ALTER TABLE "Game" RENAME COLUMN "controls_json" TO "controls";
