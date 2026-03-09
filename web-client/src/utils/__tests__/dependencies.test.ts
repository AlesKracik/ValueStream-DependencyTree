import { describe, it, expect } from 'vitest';
import pkg from '../../../package.json';

describe('Dependencies', () => {
  it('should have "socks" dependency for MongoDB proxy support', () => {
    expect(pkg.dependencies).toHaveProperty('socks');
  });

  it('should have "mongodb" dependency', () => {
    expect(pkg.dependencies).toHaveProperty('mongodb');
  });

  it('should have "ssh2" dependency for tunneling support', () => {
    expect(pkg.dependencies).toHaveProperty('ssh2');
  });
});
