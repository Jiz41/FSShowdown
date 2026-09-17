-- 本番公開直前に実行する戦績リセット用スクリプト（2026-09-16、ケンさん決定）
-- 方針: accountsテーブル（ジョッキーネーム・アイコン・国旗・DM通知設定等）は保持し、
--       対戦記録(matches)とレート(ratings)のみリセットする。
--
-- 実行タイミング: 公開判断が出た直後。今はまだ実行しないこと（テスト検証中のため）。
-- 実行コマンド: cd /root/FSShowdown && npx wrangler d1 execute fsshowdown --remote --file=scripts/reset_for_launch.sql
--
-- 実行前に必ず対象件数を確認すること:
--   npx wrangler d1 execute fsshowdown --remote --command "SELECT COUNT(*) FROM matches"
--   npx wrangler d1 execute fsshowdown --remote --command "SELECT COUNT(*) FROM ratings"

DELETE FROM matches;

-- ratingsは行ごと消すとaccounts側のrating_ps5/rating_pc表示と不整合になるため、
-- 1000へ更新する（行を残す）。accounts.rating/rating_ps5/rating_pcも合わせて1000へ戻す。
UPDATE ratings SET rating = 1000;
UPDATE accounts SET rating = 1000, rating_ps5 = 1000, rating_pc = 1000;
