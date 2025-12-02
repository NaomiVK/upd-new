import axios from 'axios';

<<<<<<< HEAD
export interface PageSpeedInsightsParams {
=======
export type PageSpeedInsightsParams = {
>>>>>>> 6dbc80a076126e64fc5d06e8b753c973ed941c0f
  url: string;
  key: string;
  category: 'ACCESSIBILITY' | 'PERFORMANCE' | 'BEST_PRACTICES' | 'SEO';
  strategy: 'mobile' | 'desktop';
  locale?: string;
<<<<<<< HEAD
}

export interface PageSpeedInsightsResponse {
=======
};

export type PageSpeedInsightsResponse = {
>>>>>>> 6dbc80a076126e64fc5d06e8b753c973ed941c0f
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
<<<<<<< HEAD
}

export class PageSpeedInsightsClient {
  private readonly API_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
  private readonly apiKey = process.env.PAGESPEED_API_KEY || '';

  async runPageSpeedTest(params: Omit<PageSpeedInsightsParams, 'key'>): Promise<PageSpeedInsightsResponse> {
    const queryParams: any = {
=======
};

export class PageSpeedInsightsClient {
  private readonly apiKey = this.getApiKey();
  private readonly API_ENDPOINT =
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

  // read environment variables during instantiation
  private getApiKey() {
    return process.env.PAGESPEED_API_KEY || '';
  }

  async runPageSpeedTest(
    params: Omit<PageSpeedInsightsParams, 'key'>,
  ): Promise<PageSpeedInsightsResponse> {
    const queryParams: PageSpeedInsightsParams = {
>>>>>>> 6dbc80a076126e64fc5d06e8b753c973ed941c0f
      url: params.url,
      key: this.apiKey,
      category: params.category,
      strategy: params.strategy,
    };

    // Add locale if provided
    if (params.locale) {
      queryParams.locale = params.locale;
    }

<<<<<<< HEAD
    const response = await axios.get<PageSpeedInsightsResponse>(this.API_ENDPOINT, {
      params: queryParams,
      timeout: 120000, // 2 minutes timeout
    });

    return response.data;
  }
}
=======
    const response = await axios.get<PageSpeedInsightsResponse>(
      this.API_ENDPOINT,
      {
        params: queryParams,
        timeout: 120000, // 2 minutes timeout
      },
    );

    return response.data;
  }
}
>>>>>>> 6dbc80a076126e64fc5d06e8b753c973ed941c0f
