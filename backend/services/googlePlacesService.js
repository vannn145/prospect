const axios = require('axios');

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const NEARBY_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const CATEGORY_LABELS = {
  atm: 'Caixa',
  bank: 'Banco',
  bar: 'Bar',
  cafe: 'Café',
  car_dealer: 'Concessionária',
  dentist: 'Odonto',
  doctor: 'Clínica',
  hospital: 'Hospital',
  convenience_store: 'Conveniência',
  shopping_mall: 'Shopping',
  lawyer: 'Advocacia',
  restaurant: 'Bistrô',
  spa: 'Spa',
  hair_care: 'Barbearia',
  book_store: 'Livraria',
  bakery: 'Padaria',
  pharmacy: 'Farmácia',
  shoe_store: 'Calçados',
  jewelry_store: 'Joias',
  furniture_store: 'Móveis',
  supermarket: 'Mercado',
  gym: 'Academia',
  beauty_salon: 'Studio',
  pet_store: 'Pet',
  veterinary_care: 'Vet',
  physiotherapist: 'Fisio',
  real_estate_agency: 'Imóveis',
  accountant: 'Contábil',
  accounting: 'Contábil',
  insurance_agency: 'Seguros',
  car_repair: 'Oficina',
  car_wash: 'Lava Rápido',
  gas_station: 'Posto',
  electrician: 'Elétrica',
  plumber: 'Hidráulica',
  hardware_store: 'Materiais',
  clothing_store: 'Moda',
  electronics_store: 'Eletrônicos',
  home_goods_store: 'Casa',
  florist: 'Floricultura',
  laundry: 'Lavanderia',
  school: 'Escola',
  travel_agency: 'Turismo',
};

const CATEGORY_ALIASES = {
  accounting: 'accountant',
};

const OSM_CATEGORY_FILTERS = {
  atm: [['amenity', 'atm']],
  bank: [['amenity', 'bank']],
  bar: [['amenity', 'bar']],
  cafe: [['amenity', 'cafe']],
  car_dealer: [['shop', 'car']],
  dentist: [['amenity', 'dentist']],
  doctor: [['amenity', 'doctors'], ['healthcare', 'doctor']],
  hospital: [['amenity', 'hospital']],
  convenience_store: [['shop', 'convenience']],
  shopping_mall: [['shop', 'mall']],
  lawyer: [['office', 'lawyer']],
  restaurant: [['amenity', 'restaurant']],
  spa: [['leisure', 'spa'], ['beauty', 'spa']],
  hair_care: [['shop', 'hairdresser']],
  book_store: [['shop', 'books']],
  bakery: [['shop', 'bakery']],
  pharmacy: [['amenity', 'pharmacy']],
  shoe_store: [['shop', 'shoes']],
  jewelry_store: [['shop', 'jewelry']],
  furniture_store: [['shop', 'furniture']],
  supermarket: [['shop', 'supermarket']],
  gym: [['leisure', 'fitness_centre']],
  beauty_salon: [['shop', 'beauty'], ['amenity', 'beauty_salon']],
  pet_store: [['shop', 'pet']],
  veterinary_care: [['amenity', 'veterinary']],
  physiotherapist: [['healthcare', 'physiotherapist']],
  real_estate_agency: [['office', 'estate_agent']],
  accountant: [['office', 'accountant']],
  accounting: [['office', 'accountant']],
  insurance_agency: [['office', 'insurance']],
  car_repair: [['shop', 'car_repair']],
  car_wash: [['amenity', 'car_wash']],
  gas_station: [['amenity', 'fuel']],
  electrician: [['craft', 'electrician']],
  plumber: [['craft', 'plumber']],
  hardware_store: [['shop', 'doityourself']],
  clothing_store: [['shop', 'clothes']],
  electronics_store: [['shop', 'electronics']],
  home_goods_store: [['shop', 'houseware']],
  florist: [['shop', 'florist']],
  laundry: [['shop', 'laundry'], ['amenity', 'laundry']],
  school: [['amenity', 'school']],
  travel_agency: [['shop', 'travel_agency'], ['office', 'travel_agent']],
};

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

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function getMockWebsite(index, city, category) {
  const citySlug = slugify(city);
  const categorySlug = slugify(category);

  if (index % 3 === 0) {
    return null;
  }

  if (index % 3 === 1) {
    return `http://${categorySlug}-${citySlug}-${index}.negocio-local.test`;
  }

  return `https://${categorySlug}-${citySlug}-${index}.empresaweb.test`;
}

function getMockInstagram(index, city, category) {
  if (index % 2 === 0) {
    return null;
  }

  return `https://www.instagram.com/${slugify(category)}_${slugify(city)}_${index}/`;
}

function normalizeGooglePlaceType(category) {
  const normalized = String(category || '').trim().toLowerCase();
  return CATEGORY_ALIASES[normalized] || normalized;
}

function getOsmFiltersForCategory(category) {
  const normalized = normalizeGooglePlaceType(category);
  return OSM_CATEGORY_FILTERS[normalized] || [['office', normalized]];
}

function getOsmTag(tags, keys) {
  for (const key of keys) {
    const value = tags?.[key];
    if (value != null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return null;
}

function formatOsmAddress(tags, fallbackCity) {
  const street = [tags?.['addr:street'], tags?.['addr:housenumber']].filter(Boolean).join(', ');
  const district = getOsmTag(tags, ['addr:suburb', 'addr:neighbourhood']);
  const city = getOsmTag(tags, ['addr:city', 'addr:town', 'addr:village']) || fallbackCity;
  const state = getOsmTag(tags, ['addr:state']);

  return [street, district, city, state].filter(Boolean).join(' - ') || null;
}

function buildOverpassQuery({ latitude, longitude, radius, category }) {
  const filters = getOsmFiltersForCategory(category);
  const searchRadius = Math.max(300, Math.min(Number(radius) || 5000, 50000));

  const blocks = filters.flatMap(([key, value]) => [
    `node["${key}"="${value}"](around:${searchRadius},${latitude},${longitude});`,
    `way["${key}"="${value}"](around:${searchRadius},${latitude},${longitude});`,
    `relation["${key}"="${value}"](around:${searchRadius},${latitude},${longitude});`,
  ]);

  return `[out:json][timeout:25];(${blocks.join('')});out center tags;`;
}

async function fetchPlacesByOsm({ city, category, radius = 5000, maxPages = 3 }) {
  const geocoded = await geocodeCityWithNominatim(city);
  const query = buildOverpassQuery({
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
    radius,
    category,
  });

  const response = await axios.post(OVERPASS_URL, query, {
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'User-Agent': 'prospect/1.0 (osm-overpass-search)',
    },
    timeout: 30000,
  });

  const elements = Array.isArray(response.data?.elements) ? response.data.elements : [];
  const uniqueById = new Map();
  const maxItems = Math.max(10, Math.min(Number(maxPages || 3) * 20, 80));

  for (const element of elements) {
    const tags = element.tags || {};
    const latitude = element.lat ?? element.center?.lat ?? null;
    const longitude = element.lon ?? element.center?.lon ?? null;
    const name = getOsmTag(tags, ['name', 'brand', 'operator']);

    if (!name || latitude == null || longitude == null) {
      continue;
    }

    const placeId = `osm-${element.type}-${element.id}`;
    if (uniqueById.has(placeId)) {
      continue;
    }

    uniqueById.set(placeId, {
      name,
      phone_number: getOsmTag(tags, ['phone', 'contact:phone', 'contact:mobile']),
      address: formatOsmAddress(tags, city),
      city,
      category,
      place_id: placeId,
      website: getOsmTag(tags, ['website', 'contact:website']),
      rating: null,
      total_reviews: 0,
      latitude: Number(latitude),
      longitude: Number(longitude),
      source: 'osm',
    });

    if (uniqueById.size >= maxItems) {
      break;
    }
  }

  return [...uniqueById.values()];
}

function generateMockPlaces({ city, category, radius = 5000 }) {
  const label = CATEGORY_LABELS[category] || 'Empresa';
  const citySlug = slugify(city);
  const baseLat = -23.55052;
  const baseLng = -46.633308;

  return Array.from({ length: 12 }, (_, index) => {
    const order = index + 1;
    const website = getMockWebsite(order, city, category);
    const statusSite = !website ? 'sem_site' : order % 3 === 1 ? 'site_fraco' : 'site_ok';
    const phoneSuffix = String(1000 + order).slice(-4);

    return {
      name: `${label} ${city} ${order}`,
      phone_number: `(19) 9${String(88000000 + order).slice(-8)}`,
      address: `Rua Comercial ${order * 17}, ${city}`,
      city,
      category,
      place_id: `mock-${category}-${citySlug}-${radius}-${order}`,
      website,
      instagram_url: getMockInstagram(order, city, category),
      rating: Number((3.6 + (order % 12) * 0.1).toFixed(1)),
      total_reviews: order * 3,
      latitude: Number((baseLat + order * 0.0035).toFixed(6)),
      longitude: Number((baseLng - order * 0.0028).toFixed(6)),
      status_site: statusSite,
      source: 'mock',
      phone_hint: phoneSuffix,
    };
  });
}

function isGooglePlacesConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY não configurada.');
  }

  return apiKey;
}

function buildGeocodeAddressVariations(city) {
  return [
    city,
    `${city}, Brazil`,
    `${city}, São Paulo, Brazil`,
    `${city}, SP, Brazil`,
  ];
}

function extractGoogleGeocodeError(data) {
  const status = String(data?.status || '').trim() || 'UNKNOWN_ERROR';
  const message = String(data?.error_message || '').trim();
  return message ? `${status}: ${message}` : status;
}

async function geocodeCityWithGoogle(city) {
  const apiKey = getApiKey();
  const addressVariations = buildGeocodeAddressVariations(city);

  let lastError = null;

  for (const address of addressVariations) {
    try {
      const response = await axios.get(GEOCODE_URL, {
        params: {
          address,
          key: apiKey,
        },
        timeout: 15000,
      });

      if (response.data.status === 'OK' && response.data.results.length) {
        const location = response.data.results[0].geometry.location;
        return {
          latitude: location.lat,
          longitude: location.lng,
        };
      }

      lastError = extractGoogleGeocodeError(response.data);
    } catch (error) {
      lastError = error.response?.data
        ? extractGoogleGeocodeError(error.response.data)
        : error.message;
    }
  }

  throw new Error(lastError || `Não foi possível geocodificar a cidade: ${city}`);
}

async function geocodeCityWithNominatim(city) {
  const addressVariations = buildGeocodeAddressVariations(city);

  for (const address of addressVariations) {
    const response = await axios.get(NOMINATIM_SEARCH_URL, {
      params: {
        q: address,
        format: 'jsonv2',
        limit: 1,
        countrycodes: 'br',
      },
      headers: {
        'User-Agent': 'prospect/1.0 (city-search geocoding fallback)',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      timeout: 15000,
    });

    if (Array.isArray(response.data) && response.data.length) {
      const location = response.data[0];
      return {
        latitude: Number(location.lat),
        longitude: Number(location.lon),
      };
    }
  }

  throw new Error(`Não foi possível geocodificar a cidade: ${city}`);
}

async function geocodeCity(city) {
  let googleError = null;

  try {
    return await geocodeCityWithGoogle(city);
  } catch (error) {
    googleError = error;
  }

  try {
    return await geocodeCityWithNominatim(city);
  } catch {
    throw new Error(
      googleError?.message
        ? `Não foi possível geocodificar a cidade: ${city}. ${googleError.message}`
        : `Não foi possível geocodificar a cidade: ${city}`
    );
  }
}

async function fetchNearbyPage(params) {
  const response = await axios.get(NEARBY_SEARCH_URL, {
    params,
    timeout: Number(process.env.GOOGLE_NEARBY_TIMEOUT_MS || 10000),
  });

  return response.data;
}

async function fetchNearbyPlaces({ latitude, longitude, radius, category, maxPages }) {
  const apiKey = getApiKey();
  const placeType = normalizeGooglePlaceType(category);

  const results = [];
  let nextPageToken = null;

  for (let page = 0; page < maxPages; page += 1) {
    const params = nextPageToken
      ? {
          pagetoken: nextPageToken,
          key: apiKey,
        }
      : {
          location: `${latitude},${longitude}`,
          radius,
          type: placeType,
          key: apiKey,
        };

    if (nextPageToken) {
      await sleep(2200);
    }

    let data = await fetchNearbyPage(params);

    if (data.status === 'INVALID_REQUEST' && nextPageToken) {
      await sleep(2200);
      data = await fetchNearbyPage(params);
    }

    if (data.status === 'ZERO_RESULTS') {
      break;
    }

    if (data.status !== 'OK') {
      throw new Error(`Erro no Nearby Search: ${data.status}`);
    }

    results.push(...data.results);
    nextPageToken = data.next_page_token;

    if (!nextPageToken) {
      break;
    }
  }

  return results;
}

async function fetchPlaceDetails(placeId) {
  const apiKey = getApiKey();

  const response = await axios.get(PLACE_DETAILS_URL, {
    params: {
      place_id: placeId,
      fields:
        'name,formatted_phone_number,formatted_address,website,rating,user_ratings_total,geometry,place_id',
      key: apiKey,
    },
    timeout: Number(process.env.GOOGLE_PLACE_DETAILS_TIMEOUT_MS || 8000),
  });

  if (response.data.status !== 'OK' || !response.data.result) {
    return null;
  }

  const place = response.data.result;

  return {
    name: place.name || null,
    phone_number: place.formatted_phone_number || null,
    address: place.formatted_address || null,
    place_id: place.place_id || placeId,
    website: place.website || null,
    rating: place.rating || null,
    total_reviews: place.user_ratings_total || 0,
    latitude: place.geometry?.location?.lat || null,
    longitude: place.geometry?.location?.lng || null,
  };
}

async function fetchPlacesByCityAndCategory({ city, category, radius = 5000, maxPages = 3 }) {
  if (!isGooglePlacesConfigured()) {
    return generateMockPlaces({ city, category, radius, maxPages });
  }

  try {
    const geocoded = await geocodeCity(city);

    const nearbyPlaces = await fetchNearbyPlaces({
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      radius,
      category,
      maxPages,
    });

    const uniqueByPlaceId = new Map();

    for (const place of nearbyPlaces) {
      if (place.place_id && !uniqueByPlaceId.has(place.place_id)) {
        uniqueByPlaceId.set(place.place_id, place);
      }
    }

    const allUnique = [...uniqueByPlaceId.values()];
    const detailsConcurrency = getSafePositiveInt(
      process.env.GOOGLE_PLACE_DETAILS_CONCURRENCY,
      6,
      { min: 1, max: 15 }
    );

    const detailedResults = await processWithConcurrency(
      allUnique,
      async (place) => {
        const details = await fetchPlaceDetails(place.place_id);

        return {
          name: details?.name || place.name || null,
          phone_number: details?.phone_number || null,
          address: details?.address || place.vicinity || null,
          city,
          category,
          place_id: place.place_id,
          website: details?.website || null,
          rating: details?.rating || place.rating || null,
          total_reviews: details?.total_reviews || place.user_ratings_total || 0,
          latitude: details?.latitude || place.geometry?.location?.lat || null,
          longitude: details?.longitude || place.geometry?.location?.lng || null,
        };
      },
      detailsConcurrency
    );

    return detailedResults;
  } catch (error) {
    console.warn(`[googlePlacesService] fallback Google->OSM em ${city}/${category}: ${error.message}`);

    try {
      const osmResults = await fetchPlacesByOsm({ city, category, radius, maxPages });
      if (osmResults.length) {
        return osmResults;
      }
    } catch (osmError) {
      console.warn(
        `[googlePlacesService] fallback OSM->mock em ${city}/${category}: ${osmError.message}`
      );
    }

    return generateMockPlaces({ city, category, radius, maxPages });
  }
}

module.exports = {
  fetchPlacesByCityAndCategory,
  isGooglePlacesConfigured,
};
