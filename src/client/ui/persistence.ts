class AppPersistence {
  get<T>(id: string, fallback: T, validate?: (value: unknown) => value is T): T {
    try {
      const current = localStorage.getItem(`detective-ui:${id}`);
      const legacy = localStorage.getItem(`ou:${id}`);
      const value = JSON.parse(current ?? legacy ?? 'null');
      if (value === null || (validate && !validate(value))) return fallback;
      if (current === null && legacy !== null) this.set(id, value);
      return value as T;
    } catch {
      return fallback;
    }
  }

  set<T>(id: string, value: T) {
    try {
      localStorage.setItem(`detective-ui:${id}`, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}

export const appPersistence = new AppPersistence();

