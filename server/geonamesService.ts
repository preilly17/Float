import type { LocationSearchResult } from './locationService';

interface GeoNamesSearchResult {
  geonameId: number;
  name: string;
  asciiName: string;
  toponymName: string;
  countryCode: string;
  countryName: string;
  adminName1?: string;
  population: number;
  lat: string;
  lng: string;
  fcode?: string;
  fcl?: string;
}

interface GeoNamesResponse {
  totalResultsCount: number;
  geonames: GeoNamesSearchResult[];
}

class GeoNamesService {
  private readonly baseUrl = 'http://api.geonames.org';
  private username: string | null = null;

  constructor() {
    this.username = process.env.GEONAMES_USERNAME || null;
  }

  isConfigured(): boolean {
    return Boolean(this.username);
  }

  async searchCities(query: string, limit: number = 10): Promise<LocationSearchResult[]> {
    if (!this.username) {
      console.warn('GeoNames username not configured');
      return [];
    }

    if (!query || query.length < 2) {
      return [];
    }

    try {
      const params = new URLSearchParams({
        q: query,
        maxRows: String(Math.min(limit, 20)),
        username: this.username,
        featureClass: 'P',
        style: 'full',
        orderby: 'relevance',
      });

      const response = await fetch(`${this.baseUrl}/searchJSON?${params}`);
      
      if (!response.ok) {
        console.error('GeoNames API error:', response.status, response.statusText);
        return [];
      }

      const data: GeoNamesResponse = await response.json();

      if (!data.geonames || data.geonames.length === 0) {
        return [];
      }

      return data.geonames.map((result) => this.transformToLocationResult(result));
    } catch (error) {
      console.error('GeoNames search error:', error);
      return [];
    }
  }

  async searchCountries(query: string, limit: number = 10): Promise<LocationSearchResult[]> {
    if (!this.username) {
      return [];
    }

    if (!query || query.length < 2) {
      return [];
    }

    try {
      const params = new URLSearchParams({
        q: query,
        maxRows: String(Math.min(limit, 10)),
        username: this.username,
        featureCode: 'PCLI',
        style: 'full',
      });

      const response = await fetch(`${this.baseUrl}/searchJSON?${params}`);
      
      if (!response.ok) {
        return [];
      }

      const data: GeoNamesResponse = await response.json();

      if (!data.geonames) {
        return [];
      }

      return data.geonames.map((result) => ({
        ...this.transformToLocationResult(result),
        type: 'COUNTRY' as const,
      }));
    } catch (error) {
      console.error('GeoNames country search error:', error);
      return [];
    }
  }

  async searchAll(query: string, limit: number = 15): Promise<LocationSearchResult[]> {
    if (!this.username) {
      return [];
    }

    if (!query || query.length < 2) {
      return [];
    }

    try {
      const params = new URLSearchParams({
        q: query,
        maxRows: String(Math.min(limit, 25)),
        username: this.username,
        style: 'full',
        orderby: 'relevance',
      });

      const response = await fetch(`${this.baseUrl}/searchJSON?${params}`);
      
      if (!response.ok) {
        console.error('GeoNames API error:', response.status);
        return [];
      }

      const data: GeoNamesResponse = await response.json();

      if (!data.geonames) {
        return [];
      }

      return data.geonames.map((result) => this.transformToLocationResult(result));
    } catch (error) {
      console.error('GeoNames search error:', error);
      return [];
    }
  }

  private transformToLocationResult(geoname: GeoNamesSearchResult): LocationSearchResult {
    const stateOrRegion = geoname.adminName1 || undefined;
    const displayParts = [geoname.name];
    if (stateOrRegion && stateOrRegion !== geoname.name) {
      displayParts.push(stateOrRegion);
    }
    displayParts.push(geoname.countryName || geoname.countryCode);
    const displayName = displayParts.join(', ');

    let type: 'AIRPORT' | 'CITY' | 'COUNTRY' = 'CITY';
    if (geoname.fcode === 'PCLI' || geoname.fcode === 'PCL') {
      type = 'COUNTRY';
    } else if (geoname.fcl === 'S' && geoname.fcode?.startsWith('AIRP')) {
      type = 'AIRPORT';
    }

    return {
      id: String(geoname.geonameId),
      name: geoname.name,
      type,
      countryCode: geoname.countryCode,
      latitude: parseFloat(geoname.lat),
      longitude: parseFloat(geoname.lng),
      detailedName: displayName,
      relevance: geoname.population || 0,
      displayName,
      region: stateOrRegion,
      isPopular: geoname.population > 500000,
      alternativeNames: [geoname.asciiName, geoname.toponymName].filter(Boolean),
      countryName: geoname.countryName || null,
      country: geoname.countryName || null,
      cityName: type === 'CITY' ? geoname.name : null,
      state: stateOrRegion || null,
      source: 'geonames',
      geonameId: geoname.geonameId,
      population: geoname.population || null,
    };
  }
}

export const geonamesService = new GeoNamesService();
