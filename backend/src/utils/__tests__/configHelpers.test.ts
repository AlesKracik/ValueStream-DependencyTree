import { describe, it, expect } from 'vitest';
import { maskSettings, unmaskSettings, calculateQuarter } from '../configHelpers';

describe('configHelpers', () => {
  describe('maskSettings', () => {
    it('should mask sensitive fields', () => {
      const settings = {
        api_token: 'secret123',
        uri: 'mongodb://user:pass@host',
        general: {
          name: 'My App',
          nested: {
            aws_access_key: 'AKIA123'
          }
        }
      };

      const masked = maskSettings(settings);

      expect(masked.api_token).toBe('********');
      expect(masked.uri).toBe('********');
      expect(masked.general.name).toBe('My App');
      expect(masked.general.nested.aws_access_key).toBe('********');
    });

    it('should handle null or undefined', () => {
      expect(maskSettings(null)).toBeNull();
      expect(maskSettings(undefined)).toBeUndefined();
    });

    it('should mask arrays if needed', () => {
      const settings = [{ api_token: 'secret' }, { other: 'value' }];
      const masked = maskSettings(settings);
      expect(masked[0].api_token).toBe('********');
      expect(masked[1].other).toBe('value');
    });
  });

  describe('unmaskSettings', () => {
    it('should restore sensitive fields from existing settings if masked', () => {
      const existing = {
        api_token: 'secret123',
        uri: 'mongodb://user:pass@host',
        general: {
          name: 'My App',
          nested: {
            aws_access_key: 'AKIA123'
          }
        }
      };

      const newData = {
        api_token: '********',
        uri: 'mongodb://newuser:newpass@newhost', // Changed value
        general: {
          name: 'New App Name',
          nested: {
            aws_access_key: '********'
          }
        }
      };

      const unmasked = unmaskSettings(newData, existing);

      // Restored from existing
      expect(unmasked.api_token).toBe('secret123');
      expect(unmasked.general.nested.aws_access_key).toBe('AKIA123');
      
      // Kept new value
      expect(unmasked.uri).toBe('mongodb://newuser:newpass@newhost');
      expect(unmasked.general.name).toBe('New App Name');
    });
  });

  describe('calculateQuarter', () => {
    it('should calculate FY quarters correctly based on start month', () => {
      // If FY starts in April (4)
      expect(calculateQuarter('2026-03-15', 4)).toBe('FY26Q4'); // Mar 2026 is Q4 of FY26
      expect(calculateQuarter('2026-04-15', 4)).toBe('FY27Q1'); // Apr 2026 is Q1 of FY27
      expect(calculateQuarter('2026-07-15', 4)).toBe('FY27Q2'); // Jul 2026 is Q2 of FY27
      
      // If FY starts in January (1)
      expect(calculateQuarter('2026-01-15', 1)).toBe('FY27Q1');
      expect(calculateQuarter('2026-12-15', 1)).toBe('FY27Q4');
    });
  });
});
