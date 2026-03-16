import { describe, it, expect } from 'vitest';
import pkg from '../../../package.json';

describe('Dependencies', () => {
  it('should have "socks" dependency for MongoDB proxy support', () => {
    expect((pkg.dependencies as any)).toHaveProperty('socks');
  });

  it('should have "mongodb" dependency', () => {
    expect((pkg.dependencies as any)).toHaveProperty('mongodb');
  });

  it('should have "fastify" dependency', () => {
    expect((pkg.dependencies as any)).toHaveProperty('fastify');
  });
});
