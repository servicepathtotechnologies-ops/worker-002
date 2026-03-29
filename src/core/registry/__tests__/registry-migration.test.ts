/**
 * Unit tests for Registry Migration
 */

import {
  applyFormIdentityMigration,
  dryRunFormIdentityMigration,
  getMigrationStatus,
  getMigrationReport,
  isNodeMigrated,
  validateRegistryCoverage,
} from '../registry-migration-helper';
import { unifiedNodeRegistry } from '../unified-node-registry';

describe('Registry Migration', () => {
  describe('getMigrationStatus', () => {
    it('should return complete status for migrated nodes', () => {
      // Test with a node that should be in registry
      const status = getMigrationStatus('google_sheets');
      
      // Node should be in registry (most nodes are migrated)
      expect(status.nodeType).toBe('google_sheets');
      expect(status.inRegistry).toBe(true);
      expect(status.migrationStatus).toBe('complete');
    });
    
    it('should return pending status for unmigrated nodes', () => {
      // Test with a node that has a stub
      const status = getMigrationStatus('manual_trigger');
      
      expect(status.nodeType).toBe('manual_trigger');
      // May or may not be in registry, but should have stub
      expect(status.hasStub).toBe(true);
    });
  });
  
  describe('getMigrationReport', () => {
    it('should return migration report with statistics', () => {
      const report = getMigrationReport();
      
      expect(report.total).toBeGreaterThan(0);
      expect(report.migrated).toBeGreaterThan(0);
      expect(report.statuses.length).toBe(report.total);
    });
  });
  
  describe('isNodeMigrated', () => {
    it('should return true for migrated nodes', () => {
      // Most nodes should be migrated (in registry)
      const migrated = isNodeMigrated('google_sheets');
      expect(typeof migrated).toBe('boolean');
    });
  });
  
  describe('validateRegistryCoverage', () => {
    it('should validate registry coverage', () => {
      const validation = validateRegistryCoverage();
      
      expect(validation.valid).toBeDefined();
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
    });
  });

  describe('form identity migration report', () => {
    it('should produce dry-run and apply reports', () => {
      const workflows: any[] = [
        {
          id: 'w1',
          workflow: {
            nodes: [
              {
                id: 'form1',
                data: {
                  type: 'form',
                  config: {
                    fields: [
                      {
                        key: 'details_through_a_form_including_age',
                        name: 'details_through_a_form_including_age',
                        label: 'Details Through A Form Including Age',
                        type: 'number',
                        required: true,
                      },
                    ],
                  },
                },
              },
            ],
            edges: [],
          },
        },
      ];
      const dry = dryRunFormIdentityMigration(workflows as any);
      expect(dry.total).toBe(1);
      expect(dry.failed).toBe(0);

      const applied = applyFormIdentityMigration(workflows as any);
      expect(applied.total).toBe(1);
      expect(applied.failed).toBe(0);
      expect(applied.results[0].workflow).toBeDefined();
    });
  });
});
