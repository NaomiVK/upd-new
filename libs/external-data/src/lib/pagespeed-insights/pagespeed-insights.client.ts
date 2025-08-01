import axios from 'axios';

export interface PageSpeedInsightsParams {
  url: string;
  key: string;
  category: 'ACCESSIBILITY' | 'PERFORMANCE' | 'BEST_PRACTICES' | 'SEO';
  strategy: 'mobile' | 'desktop';
  locale?: string;
}

export interface PageSpeedInsightsResponse {
  lighthouseResult: {
    categories: {
      accessibility?: {
        score: number;
        auditRefs: Array<{
          id: string;
          weight: number;
          group?: string;
        }>;
      };
      performance?: {
        score: number;
        auditRefs: Array<{
          id: string;
          weight: number;
          group?: string;
        }>;
      };
    };
    audits: {
      [key: string]: {
        id: string;
        title: string;
        description: string;
        score: number | null;
        scoreDisplayMode: string;
        displayValue?: string;
        numericValue?: number;
        details?: {
          items?: Array<{
            node?: {
              snippet: string;
            };
            snippet?: string;
          }>;
        };
      };
    };
  };
}

export class PageSpeedInsightsClient {
  private readonly API_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
  private readonly apiKey = process.env.PAGESPEED_API_KEY || '';

  async runPageSpeedTest(params: Omit<PageSpeedInsightsParams, 'key'>): Promise<PageSpeedInsightsResponse> {
    const queryParams: any = {
      url: params.url,
      key: this.apiKey,
      category: params.category,
      strategy: params.strategy,
    };

    // Add locale if provided
    if (params.locale) {
      queryParams.locale = params.locale;
    }

    const response = await axios.get<PageSpeedInsightsResponse>(this.API_ENDPOINT, {
      params: queryParams,
      timeout: 120000, // 2 minutes timeout
    });

    return response.data;
  }
}