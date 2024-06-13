import {
  type FeedbackWithScores,
  type IFeedback,
  type WordRelevance,
} from '@dua-upd/types-common';
import { FilterQuery } from 'mongoose';
import { DbService } from '@dua-upd/db';

type FeedbackQuery = FilterQuery<IFeedback>;
type PageOrProjectOrTaskFilter =
  | { page: FeedbackQuery['page'] }
  | { projects: FeedbackQuery['projects'] }
  | { tasks: FeedbackQuery['tasks'] };

export type RelevanceQuery<T extends PageOrProjectOrTaskFilter> = {
  date: {
    $gte: Date;
    $lte: Date;
  };
} & T;

////////////////////// Either move stuff into here, or get rid of this file
