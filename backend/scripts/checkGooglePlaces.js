require('dotenv').config();
const axios = require('axios');

async function run() {
  const key = process.env.GOOGLE_PLACES_API_KEY;

  if (!key) {
    console.log('CHAVE_AUSENTE');
    process.exit(1);
  }

  try {
    const geocodeResponse = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      {
        params: {
          address: 'Campinas',
          key,
        },
        timeout: 15000,
      }
    );

    console.log(`STATUS_GEOCODE=${geocodeResponse.data.status}`);
    if (geocodeResponse.data.error_message) {
      console.log(`ERRO_GEOCODE=${geocodeResponse.data.error_message}`);
    }

    const location = geocodeResponse.data.results?.[0]?.geometry?.location;
    if (!location) {
      console.log('SEM_LOCALIZACAO_NO_GEOCODE');
      process.exit(1);
    }

    const nearbyResponse = await axios.get(
      'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
      {
        params: {
          location: `${location.lat},${location.lng}`,
          radius: 1000,
          type: 'dentist',
          key,
        },
        timeout: 15000,
      }
    );

    console.log(`STATUS_NEARBY=${nearbyResponse.data.status}`);
    if (nearbyResponse.data.error_message) {
      console.log(`ERRO_NEARBY=${nearbyResponse.data.error_message}`);
    }
    console.log(`RESULTADOS_NEARBY=${nearbyResponse.data.results?.length || 0}`);

    if (geocodeResponse.data.status === 'OK' && nearbyResponse.data.status === 'OK') {
      console.log('GOOGLE_PLACES_PRONTO=true');
      process.exit(0);
    }

    process.exit(1);
  } catch (error) {
    const message =
      error.response?.data?.error_message ||
      error.response?.data?.status ||
      error.message;

    console.log(`ERRO_REQUISICAO=${message}`);
    process.exit(1);
  }
}

run();
