"""Tests for scoring.py — PRD §9 worked examples + regression cases.

Run: python -m unittest test_scoring

These tests exercise the pure-math functions (piecewise_linear, band_for_score)
directly + the end-to-end category computers against a scratch SQLite DB
seeded with known data. DB scratch uses a temp file so it's safe to run
repeatedly without polluting life_dashboard.db.
"""
import math
import os
import tempfile
import unittest
from datetime import date, timedelta


def _reset_db() -> str:
    """Point DB_PATH at a scratch file, init schema, return path."""
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    os.environ["DB_PATH"] = f.name
    # Re-import to pick up DB_PATH
    import importlib
    import db as _db
    importlib.reload(_db)
    _db.init_db()
    return f.name


class TestPiecewiseLinear(unittest.TestCase):
    """PRD §9.5.2 — asymmetric piecewise-linear normalization."""

    def test_within_safe_range(self):
        # Worked example: calorie target 2140, safe ±100. 2050 = dist 90, within safe.
        from scoring import piecewise_linear
        self.assertEqual(piecewise_linear(2050, 2140, 100, 100, 500, 500), 1.0)

    def test_linear_decay_above(self):
        # 2310 kcal vs 2140 target: deviation +170, safe was +100, dmax +500.
        # Expected: 1 - (170 - 100) / (500 - 100) = 0.825
        from scoring import piecewise_linear
        result = piecewise_linear(2310, 2140, 100, 100, 500, 500)
        self.assertAlmostEqual(result, 0.825, places=3)

    def test_beyond_dmax_clamps_to_zero(self):
        # 2700 kcal vs 2140 target: deviation 560 > dmax 500
        from scoring import piecewise_linear
        self.assertEqual(piecewise_linear(2700, 2140, 100, 100, 500, 500), 0.0)

    def test_protein_floor_only(self):
        # Target 150g, safe_low 10g (141-150 ok), D_max_low 60g, no ceiling
        from scoring import piecewise_linear
        self.assertEqual(piecewise_linear(145, 150, 10, math.inf, 60, math.inf), 1.0)
        self.assertEqual(piecewise_linear(250, 150, 10, math.inf, 60, math.inf), 1.0)
        # 105 protein: dist = 45, in decay range
        # 1 - (45 - 10) / (60 - 10) = 1 - 35/50 = 0.3
        self.assertAlmostEqual(
            piecewise_linear(105, 150, 10, math.inf, 60, math.inf), 0.3, places=3
        )

    def test_ceiling_signal_under_target_is_safe(self):
        # Budget $500 with safe_high +$25, D_max_high +$250
        # Spending $400 (under budget) should be 1.0
        from scoring import piecewise_linear
        self.assertEqual(piecewise_linear(400, 500, math.inf, 25, math.inf, 250), 1.0)
        # Spending $540: above target by 40, safe was +25, dmax +250.
        # 1 - (40 - 25) / (250 - 25) = 1 - 15/225 = 0.9333
        self.assertAlmostEqual(
            piecewise_linear(540, 500, math.inf, 25, math.inf, 250), 0.9333, places=3
        )


class TestBandClassification(unittest.TestCase):
    def test_green_amber_red_grey(self):
        from scoring import band_for_score
        self.assertEqual(band_for_score(85), "green")
        self.assertEqual(band_for_score(75), "green")  # threshold inclusive
        self.assertEqual(band_for_score(74), "amber")
        self.assertEqual(band_for_score(50), "amber")
        self.assertEqual(band_for_score(49), "red")
        self.assertEqual(band_for_score(0), "red")
        self.assertEqual(band_for_score(None), "grey")


class TestCategoryComposition(unittest.TestCase):
    """End-to-end tests with seeded DB."""

    @classmethod
    def setUpClass(cls):
        cls.db_path = _reset_db()
        import importlib, db as _db, scoring as _scoring
        importlib.reload(_db)
        importlib.reload(_scoring)
        cls.db = _db
        cls.scoring = _scoring

        # Seed a test user with onboarding completion 20 days ago (post-warmup)
        # and a lose_weight goal with standard targets.
        today = date.today()
        ob_date = (today - timedelta(days=20)).isoformat()
        from db import get_conn
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at) "
                "VALUES (99, 'testuser', '-', ?)",
                (ob_date,),
            )
            conn.execute(
                "INSERT INTO user_onboarding (user_id, completed, raw_inputs, profile_map, created_at, updated_at) "
                "VALUES (99, 1, '{}', '{}', ?, ?)",
                (ob_date, ob_date),
            )
            conn.execute(
                "INSERT INTO user_goals (user_id, goal_key, calorie_target, protein_g, carbs_g, fat_g, "
                "deficit_surplus, rmr, rmr_method, tdee_used, created_at, updated_at) "
                "VALUES (99, 'lose_weight', 2000, 150, 200, 65, -500, 1800, 'mifflin', 2500, ?, ?)",
                (ob_date, ob_date),
            )
            # 5 days of meals hitting all 3 windows
            for d_ago in range(5):
                d = (today - timedelta(days=d_ago)).isoformat()
                for hr, cal, prot, carbs, fat in [
                    (8, 500, 30, 50, 20),
                    (13, 700, 50, 70, 20),
                    (19, 800, 70, 80, 25),
                ]:
                    conn.execute(
                        "INSERT INTO meal_logs (user_id, logged_at, log_date, description, "
                        "calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg) "
                        "VALUES (99, ?, ?, ?, ?, ?, ?, ?, 5, 5, 600)",
                        (f"{d}T{hr:02d}:00:00", d, "meal", cal, prot, carbs, fat),
                    )
            conn.commit()
        cls.today = today.isoformat()

    def test_nutrition_scored_when_3_days_of_data(self):
        r = self.scoring.compute_nutrition_score(99, self.today).as_dict()
        self.assertIsNotNone(r["score"], f"expected score, got {r}")
        self.assertIn(r["band"], ("green", "amber", "red"))
        self.assertEqual(r["reason"], "ok")
        self.assertEqual(len(r["signals"]), 5)

    def test_calorie_adherence_signal_active(self):
        r = self.scoring.compute_nutrition_score(99, self.today).as_dict()
        cal_sig = next(s for s in r["signals"] if s["name"] == "calorie_adherence")
        self.assertIsNotNone(cal_sig["score"])
        # User consumed 2000 exactly (500+700+800) vs target 2000 → should be 1.0
        self.assertEqual(cal_sig["score"], 1.0)

    def test_protein_signal_over_target_scores_full(self):
        r = self.scoring.compute_nutrition_score(99, self.today).as_dict()
        prot_sig = next(s for s in r["signals"] if s["name"] == "protein_adherence")
        # User consumed 150g exactly (30+50+70) vs 150 target → floor-signal,
        # at target exactly = safe (delta 0), score 1.0
        self.assertEqual(prot_sig["score"], 1.0)

    def test_insufficient_days_returns_cta(self):
        # Fresh user with 0 days of nutrition logging
        from db import get_conn
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at) "
                "VALUES (100, 'newuser', '-', ?)",
                (self.today,),
            )
            conn.execute(
                "INSERT INTO user_onboarding (user_id, completed, raw_inputs, profile_map, created_at, updated_at) "
                "VALUES (100, 1, '{}', '{}', ?, ?)",
                (self.today, self.today),
            )
            conn.commit()
        r = self.scoring.compute_nutrition_score(100, self.today).as_dict()
        self.assertIsNone(r["score"])
        self.assertEqual(r["reason"], "insufficient_data")
        self.assertIn("3 days", r["cta"])


class TestOverallRedistribution(unittest.TestCase):
    """B2 — auto-weighted graceful degradation."""

    @classmethod
    def setUpClass(cls):
        cls.db_path = _reset_db()
        import importlib, db as _db, scoring as _scoring
        importlib.reload(_db)
        importlib.reload(_scoring)
        cls.db = _db
        cls.scoring = _scoring

    def test_two_scoring_categories_average_50_50(self):
        """If only fitness + nutrition score, effective_weights must be 50/50."""
        # Seed test user 200 with 3 days of meals and a couple workouts w/ weight
        today = date.today()
        ob_date = (today - timedelta(days=30)).isoformat()
        from db import get_conn
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at) "
                "VALUES (200, 'mocktests', '-', ?)",
                (ob_date,),
            )
            conn.execute(
                "INSERT INTO user_onboarding (user_id, completed, raw_inputs, profile_map, created_at, updated_at) "
                "VALUES (200, 1, '{}', '{}', ?, ?)",
                (ob_date, ob_date),
            )
            conn.execute(
                "INSERT INTO user_goals (user_id, goal_key, calorie_target, protein_g, carbs_g, fat_g, "
                "deficit_surplus, rmr, rmr_method, tdee_used, created_at, updated_at) "
                "VALUES (200, 'lose_weight', 2000, 150, 200, 65, -500, 1800, 'mifflin', 2500, ?, ?)",
                (ob_date, ob_date),
            )
            for d_ago in range(3):
                d = (today - timedelta(days=d_ago)).isoformat()
                for hr, cal, prot, carbs, fat in [(8, 500, 30, 50, 20), (13, 700, 50, 70, 20), (19, 800, 70, 80, 25)]:
                    conn.execute(
                        "INSERT INTO meal_logs (user_id, logged_at, log_date, description, "
                        "calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg) "
                        "VALUES (200, ?, ?, ?, ?, ?, ?, ?, 5, 5, 600)",
                        (f"{d}T{hr:02d}:00:00", d, "meal", cal, prot, carbs, fat),
                    )
                # Log a workout so Fitness has 3 days of data
                conn.execute(
                    "INSERT INTO workout_logs (user_id, logged_at, log_date, description, calories_burned, parse_status) "
                    "VALUES (200, ?, ?, ?, 300, 'parsed')",
                    (f"{d}T17:00:00", d, "bench press 3x8 @ 185"),
                )
                conn.execute(
                    "INSERT INTO daily_activity (user_id, log_date, weight_lbs) VALUES (200, ?, 175.0)",
                    (d,),
                )
            conn.commit()

        overall = self.scoring.compute_overall_score(200, today.isoformat())
        self.assertIsNotNone(overall["score"])
        self.assertIn("fitness", overall["contributing"])
        self.assertIn("nutrition", overall["contributing"])
        self.assertNotIn("finance", overall["contributing"])
        self.assertNotIn("time", overall["contributing"])
        self.assertAlmostEqual(overall["effective_weights"]["fitness"], 50.0, places=1)
        self.assertAlmostEqual(overall["effective_weights"]["nutrition"], 50.0, places=1)
        self.assertEqual(overall["effective_weights"]["finance"], 0.0)
        self.assertEqual(overall["effective_weights"]["time"], 0.0)

    def test_one_category_returns_null_overall(self):
        """Per PRD §9.7.4, Overall needs ≥2 scored categories."""
        # User 201 has nothing logged
        today = date.today()
        from db import get_conn
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at) "
                "VALUES (201, 'onlyone', '-', ?)",
                (today.isoformat(),),
            )
            conn.execute(
                "INSERT INTO user_onboarding (user_id, completed, raw_inputs, profile_map, created_at, updated_at) "
                "VALUES (201, 1, '{}', '{}', ?, ?)",
                (today.isoformat(), today.isoformat()),
            )
            conn.commit()
        overall = self.scoring.compute_overall_score(201, today.isoformat())
        self.assertIsNone(overall["score"])
        self.assertEqual(overall["reason"], "insufficient_data")


class TestStrengthParser(unittest.TestCase):
    def test_basic_sets_x_reps(self):
        from strength_parser import parse_strength_description
        sets = parse_strength_description("bench press 3x8 @ 185")
        self.assertEqual(len(sets), 3)
        self.assertEqual(sets[0]["exercise_name"], "bench press")
        self.assertEqual(sets[0]["weight_lbs"], 185.0)
        self.assertEqual(sets[0]["reps"], 8)

    def test_kg_conversion(self):
        from strength_parser import parse_strength_description
        sets = parse_strength_description("back squat 5x5 @ 100kg")
        self.assertEqual(len(sets), 5)
        self.assertAlmostEqual(sets[0]["weight_lbs"], 220.5, places=1)

    def test_bodyweight_no_weight(self):
        from strength_parser import parse_strength_description
        sets = parse_strength_description("3 sets of 10 pushups")
        self.assertEqual(len(sets), 3)
        self.assertIsNone(sets[0]["weight_lbs"])
        self.assertEqual(sets[0]["reps"], 10)

    def test_cardio_returns_empty(self):
        from strength_parser import parse_strength_description
        self.assertEqual(parse_strength_description("30 min run"), [])
        self.assertEqual(parse_strength_description("5k jog"), [])
        self.assertEqual(parse_strength_description("bike 45 min zone 2"), [])

    def test_multi_exercise(self):
        from strength_parser import parse_strength_description
        sets = parse_strength_description("deadlift 5x3 @ 315, pull-ups 4x8")
        self.assertEqual(len(sets), 9)  # 5 deadlift + 4 pull-ups
        names = {s["exercise_name"] for s in sets}
        self.assertEqual(names, {"deadlift", "pull-ups"})

    def test_rpe_captured(self):
        from strength_parser import parse_strength_description
        sets = parse_strength_description("OHP 4x6 @ 95 RPE 8.5")
        self.assertTrue(all(s["rpe"] == 8.5 for s in sets))

    def test_volume_estimation(self):
        from strength_parser import parse_strength_description, estimate_session_volume
        sets = parse_strength_description("bench 3x8 @ 185, pull-ups 4x8")
        # 3*8*185 + 4*8*0 = 4440
        self.assertEqual(estimate_session_volume(sets), 4440.0)


if __name__ == "__main__":
    unittest.main()
