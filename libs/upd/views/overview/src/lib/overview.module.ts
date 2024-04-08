import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';

import { UpdComponentsModule } from '@dua-upd/upd-components';
import { ServicesModule } from '@dua-upd/upd/services';

import { OverviewComponent } from './overview.component';
import { OverviewRoutingModule } from './overview-routing.module';
import { OverviewSummaryComponent } from './overview-summary/overview-summary.component';
import { OverviewWebtrafficComponent } from './overview-webtraffic/overview-webtraffic.component';
import { OverviewSearchAnalyticsComponent } from './overview-search-analytics/overview-search-analytics.component';
import { OverviewFeedbackComponent } from './overview-feedback/overview-feedback.component';
import { OverviewCalldriversComponent } from './overview-calldrivers/overview-calldrivers.component';
import { OverviewUxTestsComponent } from './overview-ux-tests/overview-ux-tests.component';

import { OverviewEffects } from './+state/overview/overview.effects';
import { OverviewFacade } from './+state/overview/overview.facade';
import {
  OVERVIEW_FEATURE_KEY,
  overviewReducer,
} from './+state/overview/overview.reducer';

import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { I18nModule } from '@dua-upd/upd/i18n';
import { OverviewGCTasksComponent } from './overview-gc-tasks/overview-gc-tasks.component';

@NgModule({
  imports: [
    CommonModule,
    I18nModule,
    OverviewRoutingModule,
    UpdComponentsModule,
    ServicesModule,
    StoreModule.forFeature(OVERVIEW_FEATURE_KEY, overviewReducer),
    EffectsModule.forFeature([OverviewEffects]),
    NgbModule
  ],
  declarations: [
    OverviewComponent,
    OverviewSummaryComponent,
    OverviewWebtrafficComponent,
    OverviewSearchAnalyticsComponent,
    OverviewFeedbackComponent,
    OverviewCalldriversComponent,
    OverviewUxTestsComponent,
    OverviewGCTasksComponent,
  ],
  providers: [OverviewFacade],
})
export class OverviewModule {}
