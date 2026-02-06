interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  alt: string;
}

interface PexelsSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
  next_page?: string;
}

export interface PhotoSearchResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  mediumUrl: string;
  largeUrl: string;
  photographer: string;
  photographerUrl: string;
  alt: string;
  avgColor: string;
  width: number;
  height: number;
}

class PexelsService {
  private readonly baseUrl = 'https://api.pexels.com/v1';

  private getApiKey(): string | null {
    return process.env.PEXELS_API_KEY || null;
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  async searchPhotos(query: string, page: number = 1, perPage: number = 15): Promise<{
    photos: PhotoSearchResult[];
    totalResults: number;
    hasMore: boolean;
  }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.warn('Pexels API key not configured');
      return { photos: [], totalResults: 0, hasMore: false };
    }

    if (!query || query.length < 2) {
      return { photos: [], totalResults: 0, hasMore: false };
    }

    try {
      const params = new URLSearchParams({
        query,
        page: String(page),
        per_page: String(Math.min(perPage, 80)),
        orientation: 'landscape',
      });

      const response = await fetch(`${this.baseUrl}/search?${params}`, {
        headers: {
          Authorization: apiKey,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Pexels API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
          query,
          page,
          perPage,
        });
        return { photos: [], totalResults: 0, hasMore: false };
      }

      const data: PexelsSearchResponse = await response.json();

      const photos = data.photos.map((photo) => this.transformPhoto(photo));

      return {
        photos,
        totalResults: data.total_results,
        hasMore: Boolean(data.next_page),
      };
    } catch (error) {
      console.error('Pexels search error:', error);
      return { photos: [], totalResults: 0, hasMore: false };
    }
  }

  async getCuratedPhotos(page: number = 1, perPage: number = 15): Promise<{
    photos: PhotoSearchResult[];
    hasMore: boolean;
  }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { photos: [], hasMore: false };
    }

    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(Math.min(perPage, 80)),
      });

      const response = await fetch(`${this.baseUrl}/curated?${params}`, {
        headers: {
          Authorization: apiKey,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Pexels curated API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
          page,
          perPage,
        });
        return { photos: [], hasMore: false };
      }

      const data: PexelsSearchResponse = await response.json();

      return {
        photos: data.photos.map((photo) => this.transformPhoto(photo)),
        hasMore: Boolean(data.next_page),
      };
    } catch (error) {
      console.error('Pexels curated error:', error);
      return { photos: [], hasMore: false };
    }
  }

  private transformPhoto(photo: PexelsPhoto): PhotoSearchResult {
    const toHttps = (url: string) => (url.startsWith('http://') ? `https://${url.slice(7)}` : url);

    return {
      id: String(photo.id),
      url: toHttps(photo.url),
      thumbnailUrl: toHttps(photo.src.small),
      mediumUrl: toHttps(photo.src.medium),
      largeUrl: toHttps(photo.src.large),
      photographer: photo.photographer,
      photographerUrl: toHttps(photo.photographer_url),
      alt: photo.alt || `Photo by ${photo.photographer}`,
      avgColor: photo.avg_color,
      width: photo.width,
      height: photo.height,
    };
  }
}

export const pexelsService = new PexelsService();
