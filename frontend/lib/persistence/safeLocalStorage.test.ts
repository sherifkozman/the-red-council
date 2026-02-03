import { describe, it, expect, vi, beforeEach } from 'vitest'
import { safeLocalStorage } from './safeLocalStorage'

describe('safeLocalStorage', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.restoreAllMocks()
    })

    it('sets and gets items', () => {
        safeLocalStorage.setItem('test-key', { foo: 'bar' })
        const item = safeLocalStorage.getItem('test-key')
        expect(item).toEqual({ foo: 'bar' })
    })

    it('handles invalid JSON gracefully', () => {
        localStorage.setItem('test-key', '{invalid-json')
        // const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const item = safeLocalStorage.getItem('test-key')
        expect(item).toBeNull()
    })

    it('handles large items', () => {
        const largeString = 'a'.repeat(10001)
        localStorage.setItem('test-key', largeString)
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const item = safeLocalStorage.getItem('test-key')
        expect(item).toBeNull()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('too large'))
    })

    it('removes items', () => {
        localStorage.setItem('test-key', 'value')
        safeLocalStorage.removeItem('test-key')
        expect(localStorage.getItem('test-key')).toBeNull()
    })

    it('handles setItem error', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota') })
        
        safeLocalStorage.setItem('key', 'value')
        expect(consoleSpy).toHaveBeenCalled()
    })
})
