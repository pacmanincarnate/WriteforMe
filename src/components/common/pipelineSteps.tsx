/**
 * @module components/common/pipelineSteps
 * Static pipeline step metadata bound to bundled `<Icon />` renderers.
 */

import type { ReactNode } from 'react';
import { PIPELINE_STEPS_META, type PipelineStepMeta } from '@/config';
import { Icon, type IconProps } from '@/components/icons';

export interface PipelineStepDescriptor extends PipelineStepMeta {
    icon: (props: Omit<IconProps, 'name'>) => ReactNode;
}

export const PIPELINE_STEPS: readonly PipelineStepDescriptor[] = PIPELINE_STEPS_META.map((step) => ({
    ...step,
    icon: (props) => <Icon name={step.iconName} {...props} />
}));
