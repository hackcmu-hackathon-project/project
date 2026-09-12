import { Item } from './data';

export type StopSuggestion = { item: Item; reason: string; sameNeighborhood: boolean };

/** Uses catalogue facts, not inferred distances or opening hours. */
export function suggestStops({ items, city, used, anchor, saved, category, maxPrice }: {
  items: Item[];
  city: Item['city'];
  used: Set<number>;
  anchor?: { hood: string };
  saved: Set<number>;
  category: string;
  maxPrice: number;
}): StopSuggestion[] {
  const favorites = new Set(items.filter(i => i.city === city && i.tier === 'loved').map(i => i.category));
  const neighborhood = anchor?.hood.trim().toLowerCase();
  return items
    .filter(i => i.city === city && !used.has(i.id) && i.tier !== 'okay' &&
      (category === 'Any' || i.category === category) && i.price <= maxPrice)
    .map(item => {
      const sameNeighborhood = Boolean(neighborhood && item.hood.trim().toLowerCase() === neighborhood);
      const reasons = [
        sameNeighborhood ? `Same neighborhood: ${item.hood}` : `Elsewhere in ${city === 'sf' ? 'San Francisco' : 'New York'}`,
        saved.has(item.id) ? 'On your want-to-go list' : null,
        favorites.has(item.category) ? `You loved ${item.category.toLowerCase()} places` : null,
      ].filter(Boolean);
      return { item, sameNeighborhood, reason: reasons.join(' · ') };
    })
    .sort((a, b) => Number(b.sameNeighborhood) - Number(a.sameNeighborhood) ||
      Number(saved.has(b.item.id)) - Number(saved.has(a.item.id)) ||
      Number(favorites.has(b.item.category)) - Number(favorites.has(a.item.category)) ||
      a.item.id - b.item.id)
    .slice(0, 3);
}
