import { registerWindowGlobals } from '@/compat/windowBridge';
import {
    buildDirectiveReviewContext,
    buildProseContext,
    DIRECTIVE_REVIEW_OUTPUT_FORMAT,
    DIRECTIVE_REVIEW_OUTPUT_FORMAT_SCHEMA,
    directiveReviewFailure,
    dispatchAI,
    parseDirectiveReview,
    PROMPT_LOG_CAP
} from '@/pipeline';

registerWindowGlobals({
    PROMPT_LOG_CAP,
    dispatchAI,
    buildProseContext,
    DIRECTIVE_REVIEW_OUTPUT_FORMAT_SCHEMA,
    directiveReviewOutputFormatSchema: DIRECTIVE_REVIEW_OUTPUT_FORMAT_SCHEMA,
    DIRECTIVE_REVIEW_OUTPUT_FORMAT,
    directiveReviewOutputFormat: DIRECTIVE_REVIEW_OUTPUT_FORMAT,
    buildDirectiveReviewContext,
    parseDirectiveReview,
    directiveReviewFailure
});
