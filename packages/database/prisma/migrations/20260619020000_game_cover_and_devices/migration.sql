-- Creator-uploaded game covers stay in private object storage and are streamed
-- through the API. Existing external coverUrl values remain valid.
ALTER TABLE "Game" ADD COLUMN "coverObjectKey" TEXT;

-- Device metadata already uses a PostgreSQL text array. Make desktop the safe
-- default and repair legacy rows whose array is empty.
ALTER TABLE "Game" ALTER COLUMN "devices" SET DEFAULT ARRAY['desktop']::TEXT[];
UPDATE "Game" SET "devices" = ARRAY['desktop']::TEXT[] WHERE cardinality("devices") = 0;
