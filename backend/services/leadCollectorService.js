const { fetchPlacesByCityAndCategory } = require('./googlePlacesService');
const { classifyWebsite, normalizeWebsiteUrl } = require('./siteClassifierService');
const { detectInstagram } = require('./instagramService');
const { calculatePriorityScore } = require('./prioritizationService');
const { upsertCompany } = require('./companyRepositoryService');

function getSafePositiveInt(value, fallback, { min = 1, max = 20 } = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function processWithConcurrency(items, worker, concurrency) {
  const safeConcurrency = getSafePositiveInt(concurrency, 1, { min: 1, max: 30 });
  const list = Array.isArray(items) ? items : [];

  if (!list.length) {
    return [];
  }

  const results = new Array(list.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= list.length) {
        return;
      }

      results[currentIndex] = await worker(list[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.min(safeConcurrency, list.length) },
    () => runWorker()
  );

  await Promise.all(workers);
  return results;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return false;
}

async function collectAndSaveLeads({
  city,
  category,
  radius = 5000,
  maxPages = 3,
  includeInstagram = false,
}) {
  if (!city || !category) {
    throw new Error('Parâmetros city e category são obrigatórios.');
  }

  const places = await fetchPlacesByCityAndCategory({
    city,
    category,
    radius: Number(radius || 5000),
    maxPages: Number(maxPages || 3),
  });

  const includeInstagramEnabled = parseBoolean(includeInstagram);
  const leadProcessConcurrency = getSafePositiveInt(
    process.env.LEAD_PROCESS_CONCURRENCY,
    4,
    { min: 1, max: 12 }
  );

  const collected = await processWithConcurrency(
    places,
    async (place) => {
      const websiteClassification = place.status_site
        ? {
            status: place.status_site,
            normalizedWebsite: normalizeWebsiteUrl(place.website),
            reasons: [],
            loadTimeMs: null,
          }
        : await classifyWebsite(place.website);

      const instagramUrl = place.instagram_url
        ? place.instagram_url
        : includeInstagramEnabled
        ? await detectInstagram({
            name: place.name,
            city: place.city,
            website: websiteClassification.normalizedWebsite,
          })
        : null;

      const priorityScore = calculatePriorityScore({
        statusSite: websiteClassification.status,
        reviews: place.total_reviews,
        contacted: false,
      });

      return upsertCompany({
        name: place.name,
        phone: place.phone_number,
        address: place.address,
        city: place.city,
        category: place.category,
        website: websiteClassification.normalizedWebsite,
        instagram_url: instagramUrl,
        rating: place.rating,
        reviews: place.total_reviews,
        status_site: websiteClassification.status,
        place_id: place.place_id,
        latitude: place.latitude,
        longitude: place.longitude,
        priority_score: priorityScore,
      });
    },
    leadProcessConcurrency
  );

  return {
    fetched: places.length,
    saved: collected.length,
    items: collected,
  };
}

async function collectMultipleSearches({
  cities,
  categories,
  radius = 5000,
  maxPages = 3,
  includeInstagram = false,
}) {
  const normalizedCities = (cities || []).map((city) => city.trim()).filter(Boolean);
  const normalizedCategories = (categories || [])
    .map((category) => category.trim())
    .filter(Boolean);

  if (!normalizedCities.length || !normalizedCategories.length) {
    throw new Error('Informe pelo menos uma cidade e uma categoria para busca automática.');
  }

  const summary = {
    totalSearches: 0,
    totalFetched: 0,
    totalSaved: 0,
    results: [],
  };

  for (const city of normalizedCities) {
    for (const category of normalizedCategories) {
      const result = await collectAndSaveLeads({
        city,
        category,
        radius,
        maxPages,
        includeInstagram,
      });

      summary.totalSearches += 1;
      summary.totalFetched += result.fetched;
      summary.totalSaved += result.saved;
      summary.results.push({
        city,
        category,
        fetched: result.fetched,
        saved: result.saved,
      });
    }
  }

  return summary;
}

module.exports = {
  collectAndSaveLeads,
  collectMultipleSearches,
};
