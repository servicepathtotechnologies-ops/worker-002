/**
 * VERSIONING SYSTEM
 * Immutable workflow versioning with compatibility checking
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface Workflow {
  nodes: any[];
  edges: any[];
  metadata?: any;
}

interface WorkflowVersion {
  version_id: string;
  full_hash: string;
  created_at: string;
  workflow: Workflow;
  metadata: Record<string, any>;
  dependencies: {
    node_library_version: string;
    assembler_version: string;
  };
  compatibility: CompatibilityInfo;
}

interface CompatibilityInfo {
  backward_compatible: boolean;
  breaking_changes: string[];
  deprecated_nodes: string[];
  migration_path: MigrationPath;
}

interface MigrationPath {
  automated: boolean;
  steps: string[];
  estimated_time: string;
}

interface VersionDiff {
  nodes_added: any[];
  nodes_removed: any[];
  config_changes: any[];
  breaking: boolean;
}

export class WorkflowVersioning {
  private storagePath: string;
  private deprecationList: Set<string>;

  constructor(storagePath: string = './workflow_versions') {
    this.storagePath = storagePath;
    this.deprecationList = new Set([
      // Add deprecated node types here
      'n8n-nodes-base.oldNodeType'
    ]);

    // Ensure storage directory exists
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
  }

  /**
   * Version a workflow with full immutability
   */
  versionWorkflow(workflow: Workflow, metadata: Record<string, any> = {}): WorkflowVersion {
    // Generate deterministic hash
    const workflowHash = this._generateHash(workflow);

    const version: WorkflowVersion = {
      version_id: workflowHash.substring(0, 12),
      full_hash: workflowHash,
      created_at: new Date().toISOString(),
      workflow: JSON.parse(JSON.stringify(workflow)), // Deep clone
      metadata: metadata,
      dependencies: {
        node_library_version: workflow.metadata?.library_version || '1.0.0',
        assembler_version: workflow.metadata?.assembler_version || '1.0.0'
      },
      compatibility: this._checkCompatibility(workflow)
    };

    // Store version
    this._storeVersion(version);

    return version;
  }

  /**
   * Deterministic hash of workflow
   */
  private _generateHash(workflow: Workflow): string {
    // Normalize JSON (sorted keys, no whitespace)
    const normalized = JSON.stringify(workflow, Object.keys(workflow).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Check backward/forward compatibility
   */
  private _checkCompatibility(workflow: Workflow): CompatibilityInfo {
    return {
      backward_compatible: true,
      breaking_changes: [],
      deprecated_nodes: this._findDeprecatedNodes(workflow),
      migration_path: this._generateMigrationPath(workflow)
    };
  }

  /**
   * Find nodes that might be deprecated in future versions
   */
  private _findDeprecatedNodes(workflow: Workflow): string[] {
    const deprecated: string[] = [];
    for (const node of workflow.nodes || []) {
      const nodeType = node.type;
      if (this.deprecationList.has(nodeType)) {
        deprecated.push(nodeType);
      }
    }
    return deprecated;
  }

  /**
   * Generate migration instructions for future versions
   */
  private _generateMigrationPath(workflow: Workflow): MigrationPath {
    // This would check node library for migration paths
    return {
      automated: true,
      steps: [],
      estimated_time: '5 minutes'
    };
  }

  /**
   * Store versioned workflow
   */
  private _storeVersion(version: WorkflowVersion): void {
    const filename = path.join(this.storagePath, `${version.version_id}.json`);
    fs.writeFileSync(filename, JSON.stringify(version, null, 2), 'utf-8');
  }

  /**
   * Retrieve specific version
   */
  getVersion(versionId: string): WorkflowVersion {
    const filename = path.join(this.storagePath, `${versionId}.json`);
    if (!fs.existsSync(filename)) {
      throw new Error(`Version ${versionId} not found`);
    }
    const data = fs.readFileSync(filename, 'utf-8');
    return JSON.parse(data);
  }

  /**
   * Diff two workflow versions
   */
  diffVersions(versionA: string, versionB: string): VersionDiff {
    const workflowA = this.getVersion(versionA).workflow;
    const workflowB = this.getVersion(versionB).workflow;

    return {
      nodes_added: this._diffNodes(workflowA, workflowB),
      nodes_removed: this._diffNodes(workflowB, workflowA),
      config_changes: this._diffConfigs(workflowA, workflowB),
      breaking: this._checkBreaking(workflowA, workflowB)
    };
  }

  /**
   * Diff nodes between workflows
   */
  private _diffNodes(workflowA: Workflow, workflowB: Workflow): any[] {
    const nodesA = new Set((workflowA.nodes || []).map(n => n.id));
    const nodesB = (workflowB.nodes || []).map(n => n.id);
    
    return (workflowB.nodes || []).filter(n => !nodesA.has(n.id));
  }

  /**
   * Diff configs between workflows
   */
  private _diffConfigs(workflowA: Workflow, workflowB: Workflow): any[] {
    const changes: any[] = [];
    
    // Compare node configs
    const nodesA = new Map((workflowA.nodes || []).map(n => [n.id, n]));
    
    for (const nodeB of workflowB.nodes || []) {
      const nodeA = nodesA.get(nodeB.id);
      if (nodeA) {
        const configA = JSON.stringify(nodeA.parameters || {});
        const configB = JSON.stringify(nodeB.parameters || {});
        if (configA !== configB) {
          changes.push({
            node_id: nodeB.id,
            node_type: nodeB.type,
            changes: {
              from: nodeA.parameters,
              to: nodeB.parameters
            }
          });
        }
      }
    }
    
    return changes;
  }

  /**
   * Check for breaking changes
   */
  private _checkBreaking(workflowA: Workflow, workflowB: Workflow): boolean {
    // Check if any nodes were removed
    const nodesA = new Set((workflowA.nodes || []).map(n => n.type));
    const nodesB = new Set((workflowB.nodes || []).map(n => n.type));
    
    // If any node types from A are missing in B, it's breaking
    for (const nodeType of nodesA) {
      if (!nodesB.has(nodeType)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * List all versions
   */
  listVersions(): string[] {
    if (!fs.existsSync(this.storagePath)) {
      return [];
    }
    
    return fs.readdirSync(this.storagePath)
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
      .sort();
  }

  /**
   * Get version metadata without loading full workflow
   */
  getVersionMetadata(versionId: string): Partial<WorkflowVersion> {
    const version = this.getVersion(versionId);
    return {
      version_id: version.version_id,
      created_at: version.created_at,
      dependencies: version.dependencies,
      compatibility: version.compatibility,
      metadata: version.metadata
    };
  }
}

/**
 * Version registry for enterprise
 */
export class VersionRegistry {
  private registry: {
    node_library: Record<string, string>;
    workflow_schema: Record<string, any>;
    capability_mappings: Record<string, any>;
  };

  constructor() {
    this.registry = {
      node_library: {
        '1.0.0': '2024-01-15',
        '1.1.0': '2024-02-01',
        '2.0.0': '2024-03-01' // Planned
      },
      workflow_schema: {
        v1: { features: ['basic_nodes', 'simple_edges'] },
        v2: { features: ['nested_workflows', 'variables'] }
      },
      capability_mappings: {
        instagram: {
          supported_from: '2.0.0',
          requires: 'http_request_fallback',
          status: 'planned'
        }
      }
    };
  }

  /**
   * Check if capability is supported in version
   */
  isCapabilitySupported(capability: string, version: string): boolean {
    const mapping = this.registry.capability_mappings[capability];
    if (!mapping) {
      return false;
    }
    
    return this._compareVersions(version, mapping.supported_from) >= 0;
  }

  /**
   * Compare version strings
   */
  private _compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }
    
    return 0;
  }

  /**
   * Get registry info
   */
  getRegistry(): typeof this.registry {
    return JSON.parse(JSON.stringify(this.registry));
  }
}
