import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx

from app.gemini_planner import apply_schedule, review_plan
from app.itinerary import ItineraryRequest, build_itinerary


class GeminiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.body = ItineraryRequest(city='sf', start_date='2026-09-12', end_date='2026-09-12', must_try_ids=[1], use_gemini=True)
        self.plan = build_itinerary(self.body, [{'id':1, 'city':'sf', 'title':'Museum', 'hood':'SoMa', 'duration_min':60}], set(), set(), [])
        self.schedule = {'summary':'Visit in the morning; confirm hours.', 'days':[{'date':'2026-09-12','stops':[{
            'item_id':1, 'arrival':'10:00','departure':'11:00','travel_minutes':0,
            'hours':'Reported 10–17; confirm with venue', 'caution':'Reserve ahead'}]}], 'omitted':[]}

    def payload(self, schedule=None):
        return {'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps(schedule or self.schedule)}]},
                'groundingMetadata':{'groundingChunks':[{'web':{'uri':'https://example.org/hours','title':'Museum'}}],
                                     'searchEntryPoint':{'renderedContent':'<div>Google Search</div>'}}}]}

    def test_grounded_schedule_preserves_catalogue_and_route(self):
        result = apply_schedule(self.plan, self.body, self.payload())
        self.assertEqual(result['days'][0]['stops'][0]['item']['title'], 'Museum')
        self.assertEqual(result['days'][0]['stops'][0]['schedule']['arrival'], '10:00')
        self.assertEqual(result['review']['status'], 'gemini')
        self.assertIn('Museum', result['days'][0]['maps_url'])
        self.assertNotIn('schedule', self.plan['days'][0]['stops'][0])

    def test_invalid_identity_dates_and_times_rejected(self):
        for change in [lambda s: s['days'][0]['stops'][0].update(item_id=999),
                       lambda s: s['days'][0].update(date='2026-09-13'),
                       lambda s: s['days'][0]['stops'][0].update(departure='10:30'),
                       lambda s: s['days'][0]['stops'][0].update(arrival='25:00'),
                       lambda s: s['days'][0]['stops'].append(s['days'][0]['stops'][0])]:
            schedule = copy.deepcopy(self.schedule)
            change(schedule)
            with self.assertRaises(ValueError):
                apply_schedule(self.plan, self.body, self.payload(schedule))

    def test_no_sources_and_truncated_responses_rejected(self):
        payload = self.payload()
        payload['candidates'][0]['groundingMetadata'] = {}
        with self.assertRaises(ValueError):
            apply_schedule(self.plan, self.body, payload)
        payload = self.payload()
        payload['candidates'][0]['finishReason'] = 'MAX_TOKENS'
        with self.assertRaises(ValueError):
            apply_schedule(self.plan, self.body, payload)

    def test_closed_must_try_is_explained(self):
        schedule = copy.deepcopy(self.schedule)
        schedule['days'][0]['stops'] = []
        schedule['omitted'] = [{'item_id':1, 'reason':'Reported closed that day; check venue'}]
        result = apply_schedule(self.plan, self.body, self.payload(schedule))
        self.assertEqual(result['unscheduled_must_try_ids'], [1])
        self.assertIsNone(result['days'][0]['maps_url'])
        self.assertEqual(result['review']['omitted'][0]['title'], 'Museum')

    async def test_no_key_and_opt_out(self):
        with patch('app.gemini_planner.get_settings', return_value=SimpleNamespace(gemini_api_key='')):
            result = await review_plan(self.plan, self.body)
            self.assertEqual(result['review']['status'], 'fallback')
            self.body.use_gemini = False
            self.assertIs(await review_plan(self.plan, self.body), self.plan)

    async def test_provider_failure_falls_back_without_leaking_errors(self):
        settings = SimpleNamespace(gemini_api_key='secret', gemini_model='test')
        with patch('app.gemini_planner.get_settings', return_value=settings), patch('httpx.AsyncClient.post', new_callable=AsyncMock, side_effect=httpx.ReadTimeout('secret')):
            result = await review_plan(self.plan, self.body)
            self.assertEqual(result['days'], self.plan['days'])
            self.assertNotIn('secret', json.dumps(result))

    async def test_request_uses_search_and_no_friend_names(self):
        self.plan['days'][0]['stops'][0]['reasons'] = ['Recommended by PRIVATE FRIEND']
        response = httpx.Response(200, json=self.payload(), request=httpx.Request('POST','https://example.org'))
        with patch('app.gemini_planner.get_settings', return_value=SimpleNamespace(gemini_api_key='secret', gemini_model='test')), patch('httpx.AsyncClient.post', new_callable=AsyncMock, return_value=response) as post:
            result = await review_plan(self.plan, self.body)
            sent = post.call_args.kwargs['json']
            self.assertEqual(sent['tools'], [{'googleSearch': {}}])
            self.assertNotIn('PRIVATE FRIEND', json.dumps(sent))
            self.assertEqual(result['review']['status'], 'gemini')


if __name__ == '__main__':
    unittest.main()
