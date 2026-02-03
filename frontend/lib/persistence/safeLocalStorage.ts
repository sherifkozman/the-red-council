export const safeLocalStorage = {
  getItem: <T>(key: string): T | null => {
    try {
      if (typeof window === 'undefined') return null
      const item = localStorage.getItem(key)
      if (!item) return null
      // DoS protection: limit size (10KB)
      if (item.length > 10000) {
          console.warn(`LocalStorage item ${key} too large, ignoring`)
          return null
      }
      return JSON.parse(item) as T
    } catch (e) {
      console.error(`Error reading ${key} from localStorage`, e)
      return null
    }
  },
  setItem: (key: string, value: any) => {
    try {
      if (typeof window === 'undefined') return
      const stringified = JSON.stringify(value)
      localStorage.setItem(key, stringified)
    } catch (e) {
      console.error(`Error writing ${key} to localStorage`, e)
    }
  },
  removeItem: (key: string) => {
      try {
          if (typeof window === 'undefined') return
          localStorage.removeItem(key)
      } catch (e) {
          console.error(`Error removing ${key} from localStorage`, e)
      }
  }
}
