const API_NINJAS_BASE_URL = 'https://api.api-ninjas.com/v1';

interface ApiNinjasAirport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  region: string;
  country: string;
  elevation_ft: string;
  latitude: string;
  longitude: string;
  timezone: string;
}

export interface AirportSearchResult {
  id: string;
  name: string;
  type: 'AIRPORT';
  iataCode: string | undefined;
  icaoCode: string | undefined;
  cityName: string | undefined;
  countryCode: string | undefined;
  countryName: string | undefined;
  region: string | undefined;
  latitude: number | undefined;
  longitude: number | undefined;
  displayName: string;
  detailedName: string;
  source: 'api-ninjas';
}

class ApiNinjasService {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.API_NINJAS_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async searchAirports(queryText: string, limit: number = 10): Promise<AirportSearchResult[]> {
    if (!this.apiKey) {
      console.debug('API Ninjas: not configured, skipping airport search');
      return [];
    }

    const trimmedQuery = queryText.trim();
    if (trimmedQuery.length < 2) {
      return [];
    }

    try {
      const url = new URL(`${API_NINJAS_BASE_URL}/airports`);
      
      if (trimmedQuery.length === 3 && /^[A-Z]{3}$/i.test(trimmedQuery)) {
        url.searchParams.set('iata', trimmedQuery.toUpperCase());
      } else if (trimmedQuery.length === 4 && /^[A-Z]{4}$/i.test(trimmedQuery)) {
        url.searchParams.set('icao', trimmedQuery.toUpperCase());
      } else {
        console.debug('API Ninjas free tier only supports IATA/ICAO lookup, skipping name search for:', trimmedQuery);
        return [];
      }

      const response = await fetch(url.toString(), {
        headers: {
          'X-Api-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        console.error('API Ninjas airport search failed:', response.status, await response.text());
        return [];
      }

      const airports: ApiNinjasAirport[] = await response.json();
      
      const results = airports
        .filter(airport => airport.iata && airport.iata.length === 3)
        .slice(0, limit)
        .map(airport => this.mapToSearchResult(airport));

      console.debug(`API Ninjas: found ${results.length} airports for query "${trimmedQuery}"`);
      return results;
    } catch (error) {
      console.error('API Ninjas airport search error:', error);
      return [];
    }
  }

  async searchAirportsByCity(cityName: string, limit: number = 10): Promise<AirportSearchResult[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const url = new URL(`${API_NINJAS_BASE_URL}/airports`);
      url.searchParams.set('city', cityName);

      const response = await fetch(url.toString(), {
        headers: {
          'X-Api-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        return [];
      }

      const airports: ApiNinjasAirport[] = await response.json();
      
      return airports
        .filter(airport => airport.iata && airport.iata.length === 3)
        .slice(0, limit)
        .map(airport => this.mapToSearchResult(airport));
    } catch (error) {
      console.error('API Ninjas city airport search error:', error);
      return [];
    }
  }

  private mapToSearchResult(airport: ApiNinjasAirport): AirportSearchResult {
    const iataCode = airport.iata || undefined;
    const icaoCode = airport.icao || undefined;
    const city = airport.city || undefined;
    const country = airport.country || undefined;
    const region = airport.region || undefined;
    
    let displayName = airport.name;
    if (iataCode) {
      displayName = `${airport.name} (${iataCode})`;
    }
    
    let detailedName = airport.name;
    if (city && country) {
      detailedName = `${airport.name}, ${city}, ${country}`;
    } else if (city) {
      detailedName = `${airport.name}, ${city}`;
    } else if (country) {
      detailedName = `${airport.name}, ${country}`;
    }

    return {
      id: iataCode || icaoCode || airport.name,
      name: airport.name,
      type: 'AIRPORT',
      iataCode,
      icaoCode,
      cityName: city,
      countryCode: undefined,
      countryName: country,
      region,
      latitude: airport.latitude ? parseFloat(airport.latitude) : undefined,
      longitude: airport.longitude ? parseFloat(airport.longitude) : undefined,
      displayName,
      detailedName,
      source: 'api-ninjas',
    };
  }
}

export const apiNinjasService = new ApiNinjasService();
