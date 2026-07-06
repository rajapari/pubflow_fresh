-- Track peer-review revision rounds (hard cap 3 enforced in the API)
ALTER TABLE "submissions" ADD COLUMN "revisionRound" INTEGER NOT NULL DEFAULT 0;
