import '@testing-library/jest-dom'

// Mock ResizeObserver for Radix UI components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock scrollIntoView for Radix Select
Element.prototype.scrollIntoView = () => {}
