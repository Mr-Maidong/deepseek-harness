// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RunningMatrix } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

describe('RunningMatrix', () => {
  it('renders six empty decorative cells with no inline styles', () => {
    const { container } = render(<RunningMatrix />)
    const matrix = container.firstElementChild!
    expect(matrix.tagName).toBe('SPAN')
    expect(matrix.getAttribute('aria-hidden')).toBe('true')
    expect(matrix.children).toHaveLength(6)
    for (const cell of matrix.children) {
      expect(cell.tagName).toBe('SPAN')
      expect(cell.childElementCount).toBe(0)
      expect(cell.textContent).toBe('')
      expect(cell.getAttribute('style')).toBeNull()
    }
    expect(matrix.querySelector('svg')).toBeNull()
    expect(matrix.querySelector('animate')).toBeNull()
  })
})
