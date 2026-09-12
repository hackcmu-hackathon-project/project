import unittest
from urllib.parse import parse_qs, urlparse

from pydantic import ValidationError

from app.itinerary import ItineraryRequest, build_itinerary


def item(id, hood="Mission", city="sf"):
    return {"id": id, "city": city, "title": f"Place {id} & garden", "hood": hood, "duration_min": 60}


def request(**kwargs):
    return ItineraryRequest(city="sf", start_date="2026-09-11", end_date="2026-09-12", **kwargs)


class ItineraryTests(unittest.TestCase):
    def test_priority_exclusion_and_overflow(self):
        plan = build_itinerary(request(must_try_ids=[4], stops_per_day=1),
                               [item(n) for n in range(1, 6)], {2}, {1},
                               [{"item_id": n, "sub": "friend", "score": 8} for n in [1, 3]])
        self.assertEqual([d["stops"][0]["item"]["id"] for d in plan["days"]], [4, 2])
        self.assertEqual(plan["unscheduled_count"], 1)
        self.assertEqual(plan["unscheduled_must_try_ids"], [])

    def test_neighborhood_grouping_no_duplicates_and_maps_order(self):
        plan = build_itinerary(request(stops_per_day=3), [item(1), item(2, "SoMa"), item(3)], {1, 2, 3}, set(), [])
        day = plan["days"][0]
        self.assertEqual([s["item"]["id"] for s in day["stops"]], [1, 3, 2])
        params = parse_qs(urlparse(day["maps_url"]).query)
        self.assertIn("Place 1 & garden", params["origin"][0])
        self.assertIn("Place 3 & garden", params["waypoints"][0])
        self.assertIn("Place 2 & garden", params["destination"][0])
        self.assertEqual(day["activity_minutes"], 180)
        self.assertEqual(plan["days"][1]["stops"], [])
        self.assertIsNone(plan["days"][1]["maps_url"])

    def test_empty_and_negative_recommendations(self):
        plan = build_itinerary(request(), [item(1)], set(), set(), [{"item_id": 1, "sub": "friend", "score": 4}])
        self.assertTrue(all(not d["stops"] for d in plan["days"]))

    def test_dates_and_limits(self):
        for start, end in [("2026-09-12", "2026-09-11"), ("2026-09-01", "2026-09-15"), ("2026-02-30", "2026-03-01")]:
            with self.assertRaises(ValidationError):
                ItineraryRequest(city="sf", start_date=start, end_date=end)
        with self.assertRaises(ValidationError):
            request(stops_per_day=6)

    def test_city_and_missing_must_try(self):
        with self.assertRaises(ValueError):
            build_itinerary(request(must_try_ids=[1]), [item(1, city="nyc")], set(), set(), [])

    def test_must_try_overflow_and_explicit_revisit(self):
        plan = build_itinerary(request(must_try_ids=[1, 2, 3, 3], stops_per_day=1), [item(n) for n in range(1, 4)], set(), {1}, [])
        self.assertEqual(plan["unscheduled_must_try_ids"], [3])
        self.assertEqual(plan["days"][0]["stops"][0]["item"]["id"], 1)

    def test_friend_attribution_and_single_stop_directions(self):
        plan = build_itinerary(request(), [item(1)], set(), set(), [{"item_id": 1, "sub": "friend", "score": 8, "name": "Sam"}])
        day = plan["days"][0]
        self.assertEqual(day["stops"][0]["reasons"], ["Recommended by Sam"])
        self.assertNotIn("origin=", day["maps_url"])
        self.assertIn("destination=", day["maps_url"])


if __name__ == "__main__":
    unittest.main()
