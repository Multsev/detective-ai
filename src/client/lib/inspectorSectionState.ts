import { useCallback, useMemo, useState } from 'react';

export type InspectorSectionPreferences = Record<string, string[]>;

export const INSPECTOR_SECTION_STORAGE_KEY = 'detective-ai:inspector-sections:v1';

export function loadInspectorSectionPreferences(storage: Pick<Storage, 'getItem'> | undefined): InspectorSectionPreferences {
  if (!storage) return {};
  try {
    return parseInspectorSectionPreferences(storage.getItem(INSPECTOR_SECTION_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function parseInspectorSectionPreferences(value: string | null): InspectorSectionPreferences {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([subjectKey, sectionIds]) => (
      Array.isArray(sectionIds)
        ? [[subjectKey, [...new Set(sectionIds.filter((sectionId): sectionId is string => typeof sectionId === 'string'))]]]
        : []
    )));
  } catch {
    return {};
  }
}

export function updateInspectorSectionPreferences(preferences: InspectorSectionPreferences, subjectKey: string, sectionIds: Iterable<string>): InspectorSectionPreferences {
  const nextSectionIds = [...new Set(sectionIds)];
  if (nextSectionIds.length === 0) {
    const { [subjectKey]: _removed, ...remaining } = preferences;
    return remaining;
  }
  return { ...preferences, [subjectKey]: nextSectionIds };
}

export function useInspectorSectionState(subjectKey: string | undefined) {
  const [preferences, setPreferences] = useState<InspectorSectionPreferences>(() => {
    return loadInspectorSectionPreferences(typeof window === 'undefined' ? undefined : window.localStorage);
  });
  const openSections = useMemo(() => new Set(subjectKey ? preferences[subjectKey] ?? [] : []), [preferences, subjectKey]);

  const replaceOpenSections = useCallback((sectionIds: Iterable<string>) => {
    if (!subjectKey) return;
    setPreferences((current) => {
      const next = updateInspectorSectionPreferences(current, subjectKey, sectionIds);
      try {
        window.localStorage.setItem(INSPECTOR_SECTION_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The inspector remains usable when browser storage is unavailable.
      }
      return next;
    });
  }, [subjectKey]);

  const setSectionOpen = useCallback((sectionId: string, open: boolean) => {
    const next = new Set(openSections);
    if (open) next.add(sectionId);
    else next.delete(sectionId);
    replaceOpenSections(next);
  }, [openSections, replaceOpenSections]);

  return { openSections, setSectionOpen, replaceOpenSections };
}
