import { registerWindowGlobals } from '@/compat/windowBridge';
import {
    EditorialSubNav,
    HumanStructuredValue,
    LiveCreationIsland,
    PIPELINE_STEPS,
    StoryResetDropdown,
    StudioConfirmModal,
    StudioFormModal
} from '@/components';

registerWindowGlobals({
    HumanStructuredValue,
    StudioConfirmModal,
    StudioFormModal,
    LiveCreationIsland,
    EditorialSubNav,
    StoryResetDropdown,
    PIPELINE_STEPS
});
