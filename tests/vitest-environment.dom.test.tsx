import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('component test environment', () => {
  it('provides a browser document for component tests', () => {
    render(<button type="button">Semantic control</button>);

    expect(screen.getByRole('button', { name: 'Semantic control' })).not.toBeNull();
  });
});
