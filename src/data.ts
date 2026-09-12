/**
 * Seed content for Rove. Mirrors the Claude Design source of truth
 * (Rove.dc.html) so the app and the design stay in sync.
 */
import { Tier } from './theme';

export type CityKey = 'sf' | 'nyc';
export type Stop = { time: string; name: string; detail: string };
export type Item = {
  id: number;
  city: CityKey;
  title: string;
  hood: string;
  stops: number;
  hours: number;
  tier: Tier | null;
  score: number | null;
  note: string;
  img: string;
  stopsList: Stop[];
};
export type Friend = { name: string; initials: string; color: string };

export const CITIES: Record<CityKey, string> = { sf: 'San Francisco', nyc: 'New York' };
export const FRIENDS: Friend[] = [
  { name: 'Jonah R.', initials: 'JR', color: '#3b5b8c' }, { name: 'Priya S.', initials: 'PS', color: '#8a2d6e' },
  { name: 'Theo L.', initials: 'TL', color: '#4f7a4a' }, { name: 'Ana C.', initials: 'AC', color: '#b3622b' },
];
const RAW_ITEMS: any[] = [
  { id: 1, city: 'sf', title: 'Lands End at sunrise, then Sutro Baths', hood: 'Outer Richmond', stops: 3, hours: 3, tier: 'loved', score: 9.4, note: 'Get to the trailhead by 6:40. The fog burns off the ruins around 8 and the whole coast opens up. Coffee after at Trouble.', stopsList: [['6:40 am', 'Lands End trailhead', 'Coastal Trail east to the labyrinth'], ['7:30 am', 'Sutro Baths', 'Climb down to the ruins, stay for the light'], ['8:45 am', 'Trouble Coffee', 'Cinnamon toast, coconut'], ['9:30 am', 'Ocean Beach walk', 'South toward the Beach Chalet']] },
  { id: 2, city: 'sf', title: 'Mission taco crawl, La Taqueria to Foreign Cinema', hood: 'Mission', stops: 4, hours: 5, tier: 'loved', score: 8.7, note: 'Split everything. Start savory, end with a movie and a drink in the courtyard.', stopsList: [['5:00 pm', 'La Taqueria', 'Carnitas, dorado style'], ['6:00 pm', 'Dolores Park', 'Sit on the upper slope'], ['7:15 pm', 'Trick Dog', 'One drink, ask about the menu'], ['8:30 pm', 'Foreign Cinema', 'Courtyard table, movie on the wall']] },
  { id: 3, city: 'sf', title: 'Ferry Building Saturday market and a bay walk', hood: 'Embarcadero', stops: 3, hours: 3, tier: 'liked', score: 7.6, note: 'Go before 9 or accept the crowds. Roli Roti porchetta line is worth it once.', stopsList: [['8:30 am', 'Ferry Plaza Farmers Market', 'Porchetta sandwich, peaches in season'], ['10:00 am', 'Embarcadero walk', 'North to Pier 39, skip the pier itself'], ['11:00 am', 'Blue Bottle', 'Sit outside']] },
  { id: 4, city: 'sf', title: 'Fort Funston dog hang and hang gliders', hood: 'Lakeshore', stops: 2, hours: 2, tier: 'liked', score: 6.8, note: 'Windy. Bring a layer even in September. Dogs everywhere, which is the point.', stopsList: [['3:00 pm', 'Fort Funston overlook', 'Watch the hang gliders launch'], ['3:45 pm', 'Sand ladder to the beach', 'Steep. Worth it.']] },
  { id: 5, city: 'sf', title: 'Cable car to Buena Vista Irish coffee', hood: 'Fisherman\u2019s Wharf', stops: 2, hours: 2, tier: 'okay', score: 4.2, note: 'Did the tourist thing. The coffee is fine, the wait is long, the ride is great.', stopsList: [['2:00 pm', 'Powell-Hyde cable car', 'Stand on the running board'], ['2:45 pm', 'Buena Vista Cafe', 'Two Irish coffees, share the counter']] },
  { id: 6, city: 'sf', title: 'Marin Headlands hike, ferry back from Sausalito', hood: 'Marin', stops: 4, hours: 6, tier: null, note: 'Rent bikes at Fisherman\u2019s Wharf, ride across, climb to Hawk Hill, coast into Sausalito, ferry home.', stopsList: [['9:00 am', 'Bike rental', 'Blazing Saddles, Hyde St'], ['10:00 am', 'Golden Gate Bridge', 'West sidewalk on weekends'], ['11:30 am', 'Hawk Hill', 'Turn around at the top'], ['2:00 pm', 'Sausalito ferry', 'Sit on the back deck']] },
  { id: 7, city: 'sf', title: 'Chinatown dim sum and a Li Po nightcap', hood: 'Chinatown', stops: 3, hours: 4, tier: null, note: 'Good Mong Kok for takeout dim sum, eat in Portsmouth Square, end at Li Po for the mai tai.', stopsList: [['11:00 am', 'Good Mong Kok Bakery', 'Cash only, point at things'], ['11:30 am', 'Portsmouth Square', 'Eat on a bench'], ['9:00 pm', 'Li Po Lounge', 'The mai tai, one is enough']] },
  { id: 8, city: 'sf', title: 'Golden Gate Park by bike, west to the windmills', hood: 'Golden Gate Park', stops: 4, hours: 4, tier: 'liked', score: 7.1, note: 'JFK is car-free. Stow Lake, bison, tulips, ocean. Simple and good.', stopsList: [['10:00 am', 'Bike pickup at Stanyan', ''], ['10:30 am', 'Stow Lake', 'Loop the island'], ['11:30 am', 'Bison paddock', ''], ['12:15 pm', 'Dutch Windmill', 'Cross to Ocean Beach']] },
  { id: 9, city: 'nyc', title: 'Brooklyn Bridge at dawn, breakfast in Dumbo', hood: 'Dumbo', stops: 3, hours: 3, tier: 'loved', score: 9.1, note: 'Walk from the Manhattan side at 6. You get the bridge nearly empty and the skyline lights up behind you.', stopsList: [['6:00 am', 'Brooklyn Bridge, Manhattan entrance', 'Centre St stairs'], ['6:45 am', 'Pebble Beach, Dumbo', 'The skyline shot, no one there'], ['7:30 am', 'Almondine Bakery', 'Almond croissant']] },
  { id: 10, city: 'nyc', title: 'Chelsea Market lunch, High Line to Hudson Yards', hood: 'Chelsea', stops: 3, hours: 3, tier: 'liked', score: 7.4, note: 'Los Tacos No. 1 adobada, eat standing. Then the whole High Line north.', stopsList: [['12:00 pm', 'Chelsea Market', 'Los Tacos No. 1'], ['1:00 pm', 'High Line', 'Enter at 16th, walk north'], ['2:00 pm', 'Hudson Yards', 'Look, leave']] },
  { id: 11, city: 'nyc', title: 'Met roof garden, then Central Park Ramble', hood: 'Upper East Side', stops: 3, hours: 4, tier: 'loved', score: 8.4, note: 'Pay what you wish is gone for visitors, but the roof is worth full price. The Ramble after is the quietest part of the park.', stopsList: [['11:00 am', 'The Met', 'Go straight to the roof'], ['1:00 pm', 'The Ramble', 'Get lost on purpose'], ['2:30 pm', 'Bethesda Terrace', 'Sit under the arcade']] },
  { id: 12, city: 'nyc', title: 'Smorgasburg Williamsburg and a waterfront walk', hood: 'Williamsburg', stops: 3, hours: 4, tier: 'okay', score: 4.6, note: 'Too many people, too many lines. The view from Domino Park saved it.', stopsList: [['11:00 am', 'Smorgasburg', 'Marine Park lot'], ['12:30 pm', 'Domino Park', 'Sit on the steps'], ['1:30 pm', 'Bedford Ave', 'Browse, leave']] },
  { id: 13, city: 'nyc', title: 'Comedy Cellar late show, slice after', hood: 'Greenwich Village', stops: 3, hours: 4, tier: 'liked', score: 7.9, note: 'Book the 11:30 show. Drop-ins are common on weeknights. Joe\u2019s after.', stopsList: [['9:30 pm', 'Olive Tree Cafe', 'Dinner upstairs'], ['11:30 pm', 'Comedy Cellar', 'Two-drink minimum'], ['1:15 am', 'Joe\u2019s Pizza', 'Plain slice']] },
  { id: 14, city: 'nyc', title: 'Staten Island Ferry at sunset, back for dumplings', hood: 'Financial District', stops: 3, hours: 3, tier: null, note: 'Free, 25 minutes each way, best view of the harbor. Ride back and walk to Chinatown.', stopsList: [['6:30 pm', 'Whitehall Terminal', 'Right side going out'], ['7:00 pm', 'St. George', 'Turn right around'], ['8:15 pm', 'Chinatown', 'Vanessa\u2019s Dumpling House']] },
  { id: 15, city: 'nyc', title: 'Village Vanguard set, then a Bleecker walk', hood: 'West Village', stops: 2, hours: 3, tier: null, note: 'Reserve ahead. The room is tiny and the sound is perfect. Walk Bleecker after.', stopsList: [['8:00 pm', 'Village Vanguard', 'First set'], ['9:45 pm', 'Bleecker St', 'Wander toward Washington Sq']] },
];
const RAW_FEED: any[] = [
  { f: 1, item: 9, score: 9.1, action: 'ranked a new #1 in', time: '2h', likes: 34, comments: 6, note: 'Finally did the dawn walk. Nobody on the bridge. Nobody.' , img: 'photo: bridge at dawn' },
  { f: 0, item: 2, score: 8.2, action: 'ranked', time: '5h', likes: 21, comments: 3, note: 'Copied Maya\u2019s version and swapped Trick Dog for ABV. Not sorry.', img: 'photo: tacos' },
  { f: 3, item: 13, score: 8.8, action: 'ranked', time: 'Yesterday', likes: 47, comments: 11, note: 'Surprise drop-in. Won\u2019t say who. Joe\u2019s at 1am hit different.', img: 'photo: the cellar sign' },
  { f: 2, item: 8, score: 6.9, action: 'ranked', time: 'Yesterday', likes: 12, comments: 2, note: 'Bison were asleep. Windmill was great. Would go again with a picnic.', img: 'photo: windmill' },
  { f: 1, item: 11, score: 8.9, action: 'ranked', time: '2d', likes: 29, comments: 4, note: 'Roof garden empty at open. Went straight up, stayed an hour.', img: 'photo: met roof' },
];

export const ITEMS: Item[] = RAW_ITEMS.map((i) => ({
  ...i,
  score: i.score ?? null,
  tier: (i.tier ?? null) as Tier | null,
  img: i.img ?? 'photo',
  stopsList: i.stopsList.map(([time, name, detail]: [string, string, string]) => ({ time, name, detail })),
}));

export type FeedPost = {
  id: string;
  friend: Friend;
  itemId: number;
  score: number;
  action: string;
  time: string;
  likes: number;
  comments: number;
  note: string;
  img: string;
};

export const FEED: FeedPost[] = RAW_FEED.map((p, idx) => ({
  id: `post-${idx}`,
  friend: FRIENDS[p.f],
  itemId: p.item,
  score: p.score,
  action: p.action,
  time: p.time,
  likes: p.likes,
  comments: p.comments,
  note: p.note,
  img: p.img,
}));

export const itemById = (id: number) => ITEMS.find((i) => i.id === id)!;
