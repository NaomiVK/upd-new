import { ConsoleLogger, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

import type {
  PageDocument,
  PageMetricsModel,
  PagesListDocument,
} from '@dua-upd/db';
import { Page, PageMetrics, PagesList, PagesListItem } from '@dua-upd/db';
import {
  DateRange,
  queryDateFormat,
  singleDatesFromDateRange,
  AdobeAnalyticsClient,
  SearchAnalyticsClient,
  AirtableClient,
  PageListData,
} from '@dua-upd/external-data';

dayjs.extend(utc);

@Injectable()
export class PageMetricsService {
  constructor(
    @Inject(AdobeAnalyticsClient.name)
    private adobeAnalyticsClient: AdobeAnalyticsClient,
    @Inject(AirtableClient.name) private airtableClient: AirtableClient,
    @Inject(SearchAnalyticsClient.name)
    private gscClient: SearchAnalyticsClient,
    private logger: ConsoleLogger,
    @InjectModel(Page.name, 'defaultConnection') private pageModel: Model<Page>,
    @InjectModel(PageMetrics.name, 'defaultConnection')
    private pageMetricsModel: PageMetricsModel,
    @InjectModel(PagesList.name, 'defaultConnection')
    private pageListModel: Model<PagesList>
  ) {}

  async fetchAndMergePageMetrics(dateRange: DateRange) {
    const [aaResults, gscResults] = await Promise.all([
      this.adobeAnalyticsClient
        .getPageMetrics(dateRange, {
          // temporary fix for pages longer than 255 characters
          search: {
            clause: `BEGINS-WITH 'www.canada.ca' AND (BEGINS-WITH 'www.canada.ca/en/revenue-agency'\
        OR BEGINS-WITH 'www.canada.ca/fr/agence-revenu' OR BEGINS-WITH 'www.canada.ca/fr/services/impots'\
        OR BEGINS-WITH 'www.canada.ca/en/services/taxes')`,
          },
        })
        // replace urls longer than 255 characters with url from published pages list
        .then(async (results) => {
          const publishedPagesList =
            (await this.pageListModel.find().lean().exec()) || [];

          if (publishedPagesList.length === 0) {
            throw new Error('No pages found in page list');
          }

          // separate en/fr pages and restructure data to make cross-referencing faster
          const publishedPages = (publishedPagesList as PagesListItem[]).reduce(
            (pages, page) => {
              const url = page.last_255; // use last 255 to match AA urls

              if (page.lang === 'en') {
                pages['en'][url] = page;
              } else if (page.lang === 'fr') {
                pages['fr'][url] = page;
              }

              return pages;
            },
            { en: {}, fr: {} } as Record<
              'en' | 'fr',
              Record<string, PageListData>
            >
          );

          const langRegex = /canada\.ca\/(en|fr)/i;

          return results.map((dayResults) => {
            return dayResults.map((result) => {
              if (result.url.startsWith('www.canada.ca')) {
                return result;
              }

              const lang = langRegex.exec(result.url)?.[1];

              return {
                ...result,
                url: publishedPages[lang]?.[result.url]?.url || result.url,
              };
            });
          });
        }),
      this.gscClient.getPageMetrics(dateRange, { dataState: 'all' }),
    ]);

    // because there'll be potentially tens of thousands of results,
    //   we'll group them by date to merge them more efficiently
    const aaDates = aaResults.map((dateResults) => dateResults[0]?.date);
    const gscDates = gscResults.map((dateResults) => dateResults[0]?.date);

    if (aaDates.length !== gscDates.length) {
      this.logger.error(
        'Mismatched dates between Adobe Analytics and Google Search Console'
      );
    }

    return aaDates
      .map((date) => {
        const aaDateResults = aaResults.find(
          (dateResults) => dateResults[0]?.date.getTime() === date.getTime()
        );
        const gscDateResults =
          gscResults.find(
            (dateResults) => dateResults[0]?.date.getTime() === date.getTime()
          ) || [];

        return aaDateResults.map((aaDateResults) => {
          const gscResults = gscDateResults.find(
            (gscDateResult) => gscDateResult.url === aaDateResults.url
          );

          return {
            _id: new Types.ObjectId(),
            ...aaDateResults,
            ...(gscResults || {}),
          };
        });
      })
      .flat() as PageMetrics[];
  }

  // take array of PageMetrics
  // -> replace 256+ urls with full urls (where applicable)
  // -> for 256+ without matches but whose start is within "ww.canada.ca/(en|fr)" -> auto-repair
  //    -> for rest, fuck it
  // -> check for/get Page refs for each
  // -> for those without a matching Page (and a valid URL):
  //    -> use HttpClient to get title + redirect(s)
  //        -> if redirected, check for Page ref w/ new URL
  //            -> if Page ref found -> add old URL to all_urls + add page ref
  //            -> if no Page ref found -> create new Page and add ref

  // So in short:
  //  -"normalize" URLs
  //  -add existing Page refs
  //  -if no ref, get data via HTTP request (keep 404s)
  //    -with data, check for existing refs again and add if found (+ update all_urls)
  //  -if still no ref, create new Page (if 404 -> is404 = true)
  //  -return metrics with proper URLs and Page refs (refs are created/updated as side effects)

  // So in shorter:
  //  -repairPartialUrls
  //  -ensurePageRefs
  // async prepareAAResults(pageMetrics: PageMetrics[]) {
  //
  // }

  // async add256PlusMetrics(dateRange: DateRange) {
  //   const pagesList = (await readFile('./all_pages_foreal.json', 'utf8').then(
  //     (data) => JSON.parse(data)
  //   )) as PagesListItem[];
  //
  //   const pagesListByLast255 = pagesList.reduce((pagesObj, page) => {
  //     pagesObj[page.last_255] = page;
  //     return pagesObj;
  //   }, {} as Record<string, PagesListItem>);
  //
  //   // "parse" DateRange into array of "dates" -> map over array and create queries (For GSC, use regex that matches 256+)
  //   const gscDates = singleDatesFromDateRange(dateRange, false) as Date[];
  //   console.log('gscDates', gscDates);
  //
  //   const gscPromises: Promise<PageMetrics[]>[] = [];
  //
  //   for (const date of gscDates) {
  //     if (gscPromises.length % 2 === 0) {
  //       await Promise.all(gscPromises);
  //     }
  //
  //     this.logger.log(`Fetching GSC Page metrics for ${date}`);
  //     const promise =
  //       this.gscClient.getPageMetrics(date, {
  //         regex:
  //           'www[.]canada[.]ca/(en/services/taxes.{225,450}|fr/services/impots.{224,450}|en/revenue-agency.{225,450}|fr/agence-revenu.{226,450})',
  //       }).then((results) => results.flat().map(
  //         (results) =>
  //           ({
  //             _id: new Types.ObjectId(),
  //             ...results,
  //           } as PageMetrics)
  //       )).then(async (results) => {
  //         await this.upsertPageMetrics(results);
  //
  //         return results;
  //       })
  //
  //     gscPromises.push(promise);
  //   }
  //
  //   const aaPromises = this.adobeAnalyticsClient.getPageMetrics(dateRange, {
  //     postProcess: async (results) => {
  //       const preparedResults = results.map((result) => {
  //         const resultWithId = {
  //           _id: new Types.ObjectId(),
  //           ...result,
  //         } as PageMetrics;
  //
  //         if (!result.url.startsWith('www.canada.ca')) {
  //           // get full url from pagesList
  //           const pageListData = pagesListByLast255[result.url];
  //
  //           if (!pageListData) {
  //             // this.logger.log(`${result.url} not found in pagesList, skipping.`);
  //
  //             return;
  //           }
  //           resultWithId.url = pageListData.url;
  //
  //           return resultWithId;
  //         } else {
  //           // this.logger.log(`${result.url} starts with www.canada.ca ??`);
  //
  //           return;
  //         }
  //
  //       })
  //         .filter((page) => !!page);
  //
  //       await this.upsertPageMetrics(preparedResults);
  //
  //       return preparedResults;
  //     },
  //   });
  //
  //   const results = (await Promise.all([...gscPromises, aaPromises])).flat(2) as PageMetrics[];
  //
  //   const uniqueUrls = [...new Set(results.map((result) => result.url))];
  //
  //   await this.ensurePageRefs(uniqueUrls);
  //
  //   // console.log(JSON.stringify(results, null, 2));
  //
  //   // for each query:
  //   //    (in batches)
  //   //    -pipeline:
  //   //      -Log current state (fetching x data for y date from z data source)
  //   //      -try/catch
  //   //        -catch -> log error (later on, collect errors and add to logs in blob storage)
  //   //      -execute query( -> parse response)
  //   //          -for AA: (for 256+ urls) -> find url match in "published/all pages" list
  //   //            -for those with no match -> collect urls and output json file?
  //   //      -insert results (upsert, i.e. update if exists, insert if not)
  //   //      -log current state (successfully x data for y date from z data source)
  //   //      -ensure refs (log before & after)
  //
  //   // for all:
  //   //    -DateRange -> Date[]
  //   //    -Query[] -> BatchAwait[]
  //   //    -logWrap -- wrap function: log start -> log success | log error (all optional)
  //   //      -(context stack -- will be logging at different levels)
  //   //      -start
  //   //      -success
  //   //      -error
  //   //      -withContext (returns logWrap factory with bound context)
  //   //    -run "task groups" in parallel + in batches
  //   //    -"subtasks"? i.e. nested tasks w/ their own context(stack)/logging/error handling?
  //   //    -Task == Task[] | function? That way it's essentially a fancy function tree that
  //   //              you can orchestrate and wrap with logic or inject context, etc. as needed
  //   // for each datasource:
  //   //    -Date[] -> Query[]
  //   // for each query:
  //   //    -execute query -> parse response
  //   //      -for AA: (for 256+ urls) -> find url match in "published/all pages" list
  //   //        -for those with no match -> collect urls and output json file?
  //   //      -insert results (upsert, i.e. update if exists, insert if not)
  // }

  async upsertPageMetrics(pageMetrics: PageMetrics[]) {
    const bulkInsertOps = [];

    for (const pageMetric of pageMetrics) {
      const pageMetricNoId = { ...pageMetric };
      delete pageMetricNoId._id;

      bulkInsertOps.push({
        updateOne: {
          filter: {
            url: pageMetric.url,
            date: pageMetric.date,
          },
          update: {
            $setOnInsert: {
              _id: pageMetric._id,
            },
            $set: pageMetricNoId,
          },
          upsert: true,
        },
      });
    }

    return this.pageMetricsModel.bulkWrite(bulkInsertOps);
  }

  async updatePageMetrics() {
    // get dates required for query
    const latestDateResults = await this.pageMetricsModel
      .findOne({}, { date: 1 })
      .sort({ date: -1 });

    // get the most recent date from the DB, and set the start date to the next day
    const latestDate = latestDateResults?.date
      ? dayjs.utc(latestDateResults['date'])
      : dayjs.utc('2020-01-01');
    const startTime = latestDate.add(1, 'day');

    // collect data up to the start of the current day/end of the previous day
    const cutoffDate = dayjs.utc().startOf('day');

    // fetch data if our db isn't up-to-date
    if (startTime.isBefore(cutoffDate)) {
      const fullDateRange = {
        start: startTime.format(queryDateFormat),
        end: cutoffDate.format(queryDateFormat),
      };

      // to be able to iterate over each day
      const dateRanges = singleDatesFromDateRange(
        fullDateRange,
        queryDateFormat
      ).map((date) => ({
        start: date,
        end: dayjs.utc(date).add(1, 'day').format(queryDateFormat),
      }));

      for (const dateRange of dateRanges) {
        this.logger.log(
          `\r\nFetching page metrics from AA & GSC for date: ${dateRange.start}\r\n`
        );

        const newPageMetrics = await this.fetchAndMergePageMetrics(dateRange);

        await this.pageMetricsModel.insertMany(newPageMetrics);

        this.logger.log(
          `Successfully inserted page metrics data for: ${dateRange.start}`
        );
      }

      return await Promise.resolve();
    } else {
      this.logger.log('Page metrics already up-to-date.');
    }
  }

  async addRefsToPageMetrics() {
    this.logger.log('Adding references to Page Metrics');

    // First check if there are any pages that share urls. If that's the case we can't associate to a specific Page
    for (const page of (await this.pageModel.find(
      {},
      { all_urls: 1 }
    )) as Page[]) {
      const pagesWithCommonUrls = await this.pageModel.find(
        {
          _id: { $ne: page._id },
          all_urls: {
            $elemMatch: { $in: page.all_urls },
          },
        },
        { _id: 1 }
      );

      if (pagesWithCommonUrls.length > 0) {
        throw new Error(
          `Found pages with duplicated URLs- Cannot add references:\r\n ${JSON.stringify(
            pagesWithCommonUrls,
            null,
            2
          )}`
        );
      }
    }

    // We can only associate metrics with pages from airtable if we want to map them to tasks/tests/projects
    // -> Iterate through pages w/ airtable_id and add refs to metric docs w/ url in all_urls
    const existingAirtablePages = (await this.pageModel.find({
      airtable_id: { $exists: true },
    })) as Page[];

    const bulkWriteOps = existingAirtablePages.map((page) => ({
      updateMany: {
        filter: { url: { $in: page.all_urls } },
        update: {
          $set: {
            page: page._id,
            tasks: page.tasks,
            projects: page.projects,
            ux_tests: page.ux_tests,
          },
        },
      },
    }));
    const airtablePageResults = await this.pageMetricsModel.bulkWrite(
      bulkWriteOps,
      { ordered: false }
    );

    this.logger.log('Write results (Pages w/ airtable_id): ');
    this.logger.log(airtablePageResults);

    // Now for metrics that don't have refs, add a page ref if it's in the page's all_urls
    const metricsUrls = (await this.pageMetricsModel
      .distinct('url', { page: { $exists: false } })
      .exec()) as string[];

    this.logger.log(
      `Adding references for ${metricsUrls.length} urls without airtable IDs`
    );

    const nonAirtableBulkWriteOps = [];

    const newPages: Page[] = [];
    const newPageRefsBulkWriteOps = [];

    const publishedPagesList =
      (await this.pageListModel.find().lean().exec()) || [];

    if (publishedPagesList.length === 0) {
      throw new Error('No pages found in page list');
    }

    // separate en/fr pages and restructure data to make cross-referencing faster
    const publishedPages = (publishedPagesList as PagesListItem[]).reduce(
      (pages, page) => {
        const url = page.last_255; // use last 255 to match AA urls

        if (page.lang === 'en') {
          pages['en'][url] = page;
        } else if (page.lang === 'fr') {
          pages['fr'][url] = page;
        }

        return pages;
      },
      { en: {}, fr: {} } as Record<'en' | 'fr', Record<string, PageListData>>
    );

    const langRegex = /canada\.ca\/(en|fr)/i;

    const existingPagesResults = await this.pageModel
      .find({
        airtable_id: { $exists: false },
        all_urls: {
          $elemMatch: { $in: metricsUrls },
        },
      })
      .lean()
      .exec();

    const existingPages = existingPagesResults.reduce(
      (existingPages, page) => {
        const lang = langRegex.exec(page.url)?.[1];

        existingPages[lang][page.url] = page;

        return existingPages;
      },
      { en: {}, fr: {} } as Record<'en' | 'fr', Record<string, Page>>
    );

    const startTime = Date.now();

    for (const url of metricsUrls) {
      const lang = langRegex.exec(url)?.[1];

      const page = existingPages[lang]?.[url];

      if (page) {
        nonAirtableBulkWriteOps.push({
          updateMany: {
            filter: { url },
            update: {
              $set: {
                page: page._id,
              },
            },
          },
        });

        continue;
      }

      // if page doesn't already exist, check if it's in the published pages list
      const publishedPage = publishedPages[lang]?.[url];

      if (publishedPage) {
        const _id = new Types.ObjectId();

        newPages.push({
          _id,
          title: publishedPage.title,
          url: publishedPage.url,
          all_urls: [publishedPage.url],
        });

        newPageRefsBulkWriteOps.push({
          updateMany: {
            filter: { url },
            update: {
              $set: {
                page: _id,
              },
            },
          },
        });
      }
    }

    const endTime = Date.now();
    this.logger.log(`"Dictionary" approach: ${endTime - startTime}ms`);

    this.logger.log('New pages length: ', newPages.length);
    this.logger.log(JSON.stringify(newPages, null, 2));
    this.logger.log(
      'Page ref insert ops length: ',
      newPageRefsBulkWriteOps.length
    );
    this.logger.log(JSON.stringify(newPageRefsBulkWriteOps, null, 2));

    // update refs while waiting for new pages to be fetched
    this.logger.log('Updating page metrics with page refs from existing pages');

    await this.pageMetricsModel.bulkWrite(nonAirtableBulkWriteOps, {
      ordered: false,
    });

    this.logger.log('Finished adding Page references to Page Metrics.');

    this.logger.log('Inserting new pages into database...');

    await this.pageModel.insertMany(newPages);

    this.logger.log('Successfully inserted new Pages into database.');

    this.logger.log('Updating page metrics with page refs from new pages...');

    await this.pageMetricsModel.bulkWrite(newPageRefsBulkWriteOps, {
      ordered: false,
    });

    const totalRefsAdded =
      newPageRefsBulkWriteOps.length + nonAirtableBulkWriteOps.length;

    this.logger.log(
      `Successfully added ${totalRefsAdded} references to Page Metrics`
    );
  }

  async ensurePageRefs(urls: string[]) {
    this.logger.log(
      'Ensuring Page Metrics have appropriate Page references...'
    );
    const existingPageResults =
      (await this.pageModel
        .find({
          all_urls: {
            $elemMatch: { $in: urls },
          },
        })
        .exec()) || [];

    const existingPages = existingPageResults.reduce(
      (existingPages, page) => {
        const lang = langRegex.exec(page.url)?.[1];

        existingPages[lang][page.url] = page;

        return existingPages;
      },
      { en: {}, fr: {} } as Record<'en' | 'fr', Record<string, Page>>
    );

    const existingUrls = existingPageResults.map((page) => page.url);

    // create new pages first, then perform all updates in one bulk write
    const newPages = urls.filter((url) => !existingUrls.includes(url));

    const pagesListData = (await this.pageListModel.find().lean().exec()) || [];

    if (pagesListData.length === 0) {
      throw new Error('No pages found in page list');
    }

    const noMatchUrls = newPages.filter(
      (url) => !newPages.some((pageUrl) => pageUrl === url)
    );

    console.log('urls with no match from published pages: ', noMatchUrls);

    // separate en/fr pages and restructure data to make cross-referencing faster
    const publishedPages = (pagesListData as PagesListItem[]).reduce(
      (pages, page) => {
        if (!page.lang) {
          return;
        }

        const url = page.last_255; // use last 255 to match AA urls

        pages[page.lang][url] = page;

        return pages;
      },
      { en: {}, fr: {} } as Record<'en' | 'fr', Record<string, PageListData>>
    );

    const langRegex = /canada\.ca\/(en|fr)/i;

    const newPagesBulkWriteOps = [];
    const addPageRefsBulkWriteOps = [];

    for (const url of newPages) {
      const lang = langRegex.exec(url)?.[1];

      const page = publishedPages[lang]?.[url];

      if (!page) {
        continue;
      }

      const _id = new Types.ObjectId();

      newPagesBulkWriteOps.push({
        insertOne: {
          document: {
            _id,
            title: page.title,
            url: page.url,
            all_urls: [page.url],
          },
        },
      });

      addPageRefsBulkWriteOps.push({
        updateMany: {
          filter: { url, page: { $exists: false } },
          update: {
            $set: {
              page: _id,
            },
          },
        },
      });
    }

    for (const url of existingUrls) {
      const lang = langRegex.exec(url)?.[1];

      const page = existingPages[lang]?.[url];

      if (page) {
        addPageRefsBulkWriteOps.push({
          updateMany: {
            filter: { url, page: { $exists: false } },
            update: {
              $set: {
                page: page._id,
              },
            },
          },
        });
      }
    }

    if (newPagesBulkWriteOps.length) {
      this.logger.log(`Inserting ${newPagesBulkWriteOps.length} new pages`);
      await this.pageModel.bulkWrite(newPagesBulkWriteOps, {
        ordered: false,
      });
    }

    if (addPageRefsBulkWriteOps.length) {
      this.logger.log(
        `Adding ${addPageRefsBulkWriteOps.length} Page references`
      );
      await this.pageMetricsModel.bulkWrite(addPageRefsBulkWriteOps, {
        ordered: false,
      });
    }

    this.logger.log('Finished ensuring Page references for Page Metrics');
  }

  // For merging AA page metrics data with pre-existing GSC data, or inserting if no match is found
  async upsertAAPageMetrics(pageMetrics: PageMetrics[]) {
    return await this.pageMetricsModel.bulkWrite(
      pageMetrics.map(
        (metrics) => ({
          updateOne: {
            filter: { url: metrics.url, date: metrics.date },
            update: { $set: metrics },
            upsert: true,
          },
        }),
        { ordered: false }
      )
    );
  }

  async addAAPageMetrics(dateRange: DateRange) {
    return await this.adobeAnalyticsClient.getPageMetrics(dateRange, {
      postProcess: this.upsertAAPageMetrics,
      search: {
        clause: `BEGINS-WITH 'www.canada.ca' AND (BEGINS-WITH 'www.canada.ca/en/revenue-agency'\
        OR BEGINS-WITH 'www.canada.ca/fr/agence-revenu' OR BEGINS-WITH 'www.canada.ca/fr/services/impots'\
        OR BEGINS-WITH 'www.canada.ca/en/services/taxes')`,
      },
    });
  }
}
