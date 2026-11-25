/**
 * @module stores/useUiStore
 * Zustand store managing navigation (`view`, selected act/sequence/scene), sidebar chrome,
 * inspector toggle, toast notifications, and imperative confirm/form dialog promises.
 */

import { create } from 'zustand';
import {
    readStorageBool,
    readStorageNullableString,
    readStorageString,
    writeStorageValue
} from './storageHelpers';

export interface ToastBookCard {
    title: string;
    coverSrc?: string | null;
    badge?: string;
    story?: Record<string, unknown>;
    audioCount?: number;
    totalScenes?: number;
    onRead?: () => void;
    onListen?: () => void;
    onStudio?: () => void;
}

export interface ToastState {
    message: string;
    type?: 'success' | 'error' | 'info' | 'warning';
    bookCard?: ToastBookCard | null;
    [key: string]: unknown;
}

export interface ConfirmModalState {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    secondaryLabel: string | null;
    danger: boolean;
    warning: boolean;
    onConfirm: (() => void) | null;
    onSecondary: (() => void) | null;
    onCancel: (() => void) | null;
}

export interface RequestConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    secondaryLabel?: string | null;
    danger?: boolean;
    warning?: boolean;
    onConfirm?: () => void;
    onSecondary?: () => void;
}

export interface FormModalField {
    name: string;
    label: string;
    type?: string;
    defaultValue?: string;
    placeholder?: string;
    required?: boolean;
    [key: string]: unknown;
}

export interface FormModalState {
    isOpen: boolean;
    title: string;
    subtitle: string;
    fields: FormModalField[];
    submitLabel: string;
    cancelLabel: string;
    onSubmit: ((formData: Record<string, unknown>) => void) | null;
    onCancel: (() => void) | null;
}

export interface OpenFormModalOptions {
    title: string;
    subtitle?: string;
    fields: FormModalField[];
    submitLabel?: string;
    cancelLabel?: string;
    onSubmit?: (formData: Record<string, unknown>) => void;
}

export interface UiState {
    view: string;
    selectedAct: number | null;
    selectedSequence: number | null;
    selectedScene: number | null;
    isInspectorMode: boolean;
    isSidebarOpen: boolean;
    isSidebarCollapsed: boolean;
    settingsTab: string;
    libraryViewMode: string;
    librarySortBy: string;
    librarySearchQuery: string;
    matrixView: 'grid' | 'list';
    toast: ToastState | null;
    confirmModalState: ConfirmModalState;
    formModalState: FormModalState;
}

export interface UiStoreActions {
    setView: (nextOrUpdater: string | ((prev: string) => string)) => string;
    isAutopilotProtectedView: (v?: string) => boolean;
    setSelectedAct: (nextOrUpdater: (number | null) | ((prev: number | null) => number | null)) => void;
    setSelectedSequence: (
        nextOrUpdater: (number | null) | ((prev: number | null) => number | null)
    ) => void;
    setSelectedScene: (
        nextOrUpdater: (number | null) | ((prev: number | null) => number | null)
    ) => void;
    setIsInspectorMode: (nextOrUpdater: boolean | ((prev: boolean) => boolean)) => void;
    toggleInspectorMode: () => void;
    setIsSidebarOpen: (nextOrUpdater: boolean | ((prev: boolean) => boolean)) => void;
    setIsSidebarCollapsed: (nextOrUpdater: boolean | ((prev: boolean) => boolean)) => void;
    toggleSidebarCollapsed: () => void;
    setSettingsTab: (tab: string) => void;
    setLibraryViewMode: (mode: string) => void;
    setLibrarySortBy: (sortBy: string) => void;
    setLibrarySearchQuery: (query: string) => void;
    setMatrixView: (mode: 'grid' | 'list') => void;
    setToast: (toast: ToastState | null) => void;
    setConfirmModalState: (
        nextOrUpdater: ConfirmModalState | ((prev: ConfirmModalState) => ConfirmModalState)
    ) => void;
    requestConfirm: (opts: RequestConfirmOptions) => Promise<boolean | 'secondary'>;
    setFormModalState: (
        nextOrUpdater: FormModalState | ((prev: FormModalState) => FormModalState)
    ) => void;
    openFormModal: (opts: OpenFormModalOptions) => Promise<Record<string, unknown> | null>;
    hydrateFromStorage: () => void;
}

export type UiStore = UiState & UiStoreActions;

function readNullableInt(key: string): number | null {
    const raw = readStorageNullableString(key);
    if (raw === null) return null;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? null : parsed;
}

function resolveDefaultMatrixView(): 'grid' | 'list' {
    const saved = readStorageNullableString('ellipsisprose_matrix_view');
    if (saved === 'grid' || saved === 'list') return saved;
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(max-width: 767px)').matches ? 'list' : 'grid';
    }
    return 'grid';
}

const DEFAULT_CONFIRM_MODAL_STATE: ConfirmModalState = {
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    secondaryLabel: null,
    danger: false,
    warning: false,
    onConfirm: null,
    onSecondary: null,
    onCancel: null
};

const DEFAULT_FORM_MODAL_STATE: FormModalState = {
    isOpen: false,
    title: '',
    subtitle: '',
    fields: [],
    submitLabel: 'Save',
    cancelLabel: 'Cancel',
    onSubmit: null,
    onCancel: null
};

function readInitialUiStorageSlice(): Pick<
    UiState,
    | 'view'
    | 'selectedAct'
    | 'selectedSequence'
    | 'selectedScene'
    | 'isInspectorMode'
    | 'isSidebarCollapsed'
    | 'settingsTab'
    | 'libraryViewMode'
    | 'librarySortBy'
    | 'matrixView'
> {
    const seqSaved =
        readStorageNullableString('ellipsisprose_selectedSequence') ||
        readStorageNullableString('ellipsisprose_selectedChapter');
    const parsedSeq = seqSaved !== null ? parseInt(seqSaved, 10) : NaN;

    return {
        view: readStorageString('ellipsisprose_view', 'setup'),
        selectedAct: readNullableInt('ellipsisprose_selectedAct'),
        selectedSequence: !isNaN(parsedSeq) ? parsedSeq : null,
        selectedScene: readNullableInt('ellipsisprose_selectedScene'),
        isInspectorMode: readStorageBool('ellipsisprose_inspector_mode', false),
        isSidebarCollapsed: readStorageBool('ellipsisprose_sidebar_collapsed', false),
        settingsTab: readStorageString('ellipsisprose_settings_tab', 'models'),
        libraryViewMode: readStorageString('ellipsisprose_library_view_mode', 'grid'),
        librarySortBy: readStorageString('ellipsisprose_library_sort_by', 'recent'),
        matrixView: resolveDefaultMatrixView()
    };
}

export const useUiStore = create<UiStore>((set, get) => ({
    ...readInitialUiStorageSlice(),
    isSidebarOpen: false,
    librarySearchQuery: '',
    toast: null,
    confirmModalState: DEFAULT_CONFIRM_MODAL_STATE,
    formModalState: DEFAULT_FORM_MODAL_STATE,

    setView: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function' ? nextOrUpdater(get().view) : nextOrUpdater;
        set({ view: next });
        writeStorageValue('ellipsisprose_view', next);
        return next;
    },

    isAutopilotProtectedView: (v) => {
        const current = v ?? get().view;
        return current === 'reader' || current === 'pipeline';
    },

    setSelectedAct: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function' ? nextOrUpdater(get().selectedAct) : nextOrUpdater;
        set({ selectedAct: next });
    },

    setSelectedSequence: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function'
                ? nextOrUpdater(get().selectedSequence)
                : nextOrUpdater;
        set({ selectedSequence: next });
    },

    setSelectedScene: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function' ? nextOrUpdater(get().selectedScene) : nextOrUpdater;
        set({ selectedScene: next });
    },

    setIsInspectorMode: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function'
                ? nextOrUpdater(get().isInspectorMode)
                : nextOrUpdater;
        set({ isInspectorMode: next });
        writeStorageValue('ellipsisprose_inspector_mode', String(next));
        if (typeof window !== 'undefined') {
            (window as unknown as { isInspectorMode?: boolean }).isInspectorMode = next;
        }
    },

    toggleInspectorMode: () => {
        const next = !get().isInspectorMode;
        get().setIsInspectorMode(next);
    },

    setIsSidebarOpen: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function' ? nextOrUpdater(get().isSidebarOpen) : nextOrUpdater;
        set({ isSidebarOpen: next });
    },

    setIsSidebarCollapsed: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function'
                ? nextOrUpdater(get().isSidebarCollapsed)
                : nextOrUpdater;
        set({ isSidebarCollapsed: next });
        writeStorageValue('ellipsisprose_sidebar_collapsed', String(next));
    },

    toggleSidebarCollapsed: () => {
        const next = !get().isSidebarCollapsed;
        get().setIsSidebarCollapsed(next);
    },

    setSettingsTab: (tab) => {
        set({ settingsTab: tab });
        writeStorageValue('ellipsisprose_settings_tab', tab);
    },

    setLibraryViewMode: (mode) => {
        set({ libraryViewMode: mode });
        writeStorageValue('ellipsisprose_library_view_mode', mode);
    },

    setLibrarySortBy: (sortBy) => {
        set({ librarySortBy: sortBy });
        writeStorageValue('ellipsisprose_library_sort_by', sortBy);
    },

    setLibrarySearchQuery: (query) => {
        set({ librarySearchQuery: query });
    },

    setMatrixView: (mode) => {
        set({ matrixView: mode });
        writeStorageValue('ellipsisprose_matrix_view', mode);
    },

    setToast: (toast) => {
        set({ toast });
    },

    setConfirmModalState: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function'
                ? nextOrUpdater(get().confirmModalState)
                : nextOrUpdater;
        set({ confirmModalState: next });
    },

    requestConfirm: ({
        title,
        message,
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        secondaryLabel = null,
        danger = false,
        warning = false,
        onConfirm,
        onSecondary
    }) =>
        new Promise<boolean | 'secondary'>((resolve) => {
            set({
                confirmModalState: {
                    isOpen: true,
                    title,
                    message,
                    confirmLabel,
                    cancelLabel,
                    secondaryLabel,
                    danger,
                    warning,
                    onConfirm: () => {
                        set((state) => ({
                            confirmModalState: { ...state.confirmModalState, isOpen: false }
                        }));
                        if (typeof onConfirm === 'function') onConfirm();
                        resolve(true);
                    },
                    onSecondary: secondaryLabel
                        ? () => {
                              set((state) => ({
                                  confirmModalState: { ...state.confirmModalState, isOpen: false }
                              }));
                              if (typeof onSecondary === 'function') onSecondary();
                              resolve('secondary');
                          }
                        : null,
                    onCancel: () => {
                        set((state) => ({
                            confirmModalState: { ...state.confirmModalState, isOpen: false }
                        }));
                        resolve(false);
                    }
                }
            });
        }),

    setFormModalState: (nextOrUpdater) => {
        const next =
            typeof nextOrUpdater === 'function'
                ? nextOrUpdater(get().formModalState)
                : nextOrUpdater;
        set({ formModalState: next });
    },

    openFormModal: ({
        title,
        subtitle = '',
        fields,
        submitLabel = 'Save',
        cancelLabel = 'Cancel',
        onSubmit
    }) =>
        new Promise<Record<string, unknown> | null>((resolve) => {
            set({
                formModalState: {
                    isOpen: true,
                    title,
                    subtitle,
                    fields,
                    submitLabel,
                    cancelLabel,
                    onSubmit: (formData) => {
                        set((state) => ({
                            formModalState: { ...state.formModalState, isOpen: false }
                        }));
                        if (typeof onSubmit === 'function') onSubmit(formData);
                        resolve(formData);
                    },
                    onCancel: () => {
                        set((state) => ({
                            formModalState: { ...state.formModalState, isOpen: false }
                        }));
                        resolve(null);
                    }
                }
            });
        }),

    hydrateFromStorage: () => {
        const hydrated = readInitialUiStorageSlice();
        set(hydrated);
        if (typeof window !== 'undefined') {
            (window as unknown as { isInspectorMode?: boolean }).isInspectorMode =
                hydrated.isInspectorMode;
        }
    }
}));
