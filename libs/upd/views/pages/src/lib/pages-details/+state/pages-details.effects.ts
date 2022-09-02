import { Injectable } from '@angular/core';
import { createEffect, Actions, ofType, concatLatestFrom } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, EMPTY, mergeMap, map, of } from 'rxjs';
import { ApiService } from '@dua-upd/upd/services';

import {
  selectDateRanges,
  selectRouteNestedParam,
  selectDatePeriod,
} from '@dua-upd/upd/state';
import * as PagesDetailsActions from './pages-details.actions';
import * as PagesDetailsSelectors from './pages-details.selectors';

@Injectable()
export class PagesDetailsEffects {
  init$ = createEffect(() => {
    return this.actions$.pipe(
      ofType(PagesDetailsActions.loadPagesDetailsInit),
      concatLatestFrom(() => [
        this.store.select(selectRouteNestedParam('id')),
        this.store.select(selectDateRanges),
        this.store.select(PagesDetailsSelectors.selectPagesDetailsData),
      ]),
      mergeMap(
        ([, pageId, { dateRange, comparisonDateRange }, pageDetailsData]) => {
          if (!pageId) {
            console.error('pageId not found when trying to load page details');
          }

          const pageIsLoaded = pageDetailsData._id === pageId; // page is already loaded (but not necessarily with the correct data)
          const dateRangeIsLoaded = pageDetailsData.dateRange === dateRange; // data for the dateRange is already loaded
          const comparisonDateRangeIsLoaded =
            pageDetailsData.comparisonDateRange === comparisonDateRange;

          if (
            pageIsLoaded &&
            dateRangeIsLoaded &&
            comparisonDateRangeIsLoaded
          ) {
            // if everything is already loaded in the state, don't update it
            return of(
              PagesDetailsActions.loadPagesDetailsSuccess({ data: null })
            );
          }

          return this.api
            .getPageDetails({
              id: pageId,
              dateRange,
              ...{ comparisonDateRange },
            })
            .pipe(
              map((data) =>
                PagesDetailsActions.loadPagesDetailsSuccess({ data })
              ),
              catchError(() => EMPTY)
            );
        }
      )
    );
  });

  pageIsLoaded = false;

  dateChange$ = createEffect(
    () => {
      return this.actions$.pipe(
        ofType(selectDatePeriod),
        concatLatestFrom(() => [
          this.store.select(selectRouteNestedParam('id')),
        ]),
        mergeMap(([, id]) => {
          if (!id) {
            this.pageIsLoaded = false;

            return of(EMPTY);
          }

          this.pageIsLoaded = true;

          return of(PagesDetailsActions.loadPagesDetailsInit());
        })
      );
    },
    {
      dispatch: this.pageIsLoaded,
    }
  );

  constructor(
    private readonly actions$: Actions,
    private api: ApiService,
    private store: Store
  ) {}
}
