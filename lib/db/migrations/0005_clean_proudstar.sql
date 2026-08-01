CREATE INDEX "hexes_owner_address_idx" ON "hexes" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX "hexes_run_id_idx" ON "hexes" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "hexes_minted_at_idx" ON "hexes" USING btree ("minted_at");--> statement-breakpoint
CREATE INDEX "hexes_country_idx" ON "hexes" USING btree ("country");--> statement-breakpoint
CREATE INDEX "hexes_run_id_claimed_at_idx" ON "hexes" USING btree ("run_id","claimed_at");--> statement-breakpoint
CREATE INDEX "runs_user_address_started_at_idx" ON "runs" USING btree ("user_address","started_at");--> statement-breakpoint
CREATE INDEX "runs_started_at_idx" ON "runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "runs_ended_at_idx" ON "runs" USING btree ("ended_at");