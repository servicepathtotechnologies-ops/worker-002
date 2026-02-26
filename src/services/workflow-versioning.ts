/**
 * Workflow Versioning Service
 * 
 * Provides version control for workflows to ensure production stability.
 * 
 * Features:
 * - Version workflows on every update
 * - Allow rollback to previous version
 * - Maintain execution compatibility
 * - Store version metadata
 * - Version history retrieval
 * - Prevent breaking running executions
 */

import { getSupabaseClient } from '../core/database/supabase-compat';
import { WorkflowNode, WorkflowEdge } from '../core/types/ai-types';

/**
 * Workflow version structure
 */
export interface WorkflowVersion {
  workflowId: string;
  version: number;
  createdAt: string;
  createdBy?: string;
  changes: VersionChanges;
  definitionSnapshot: {
    name: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    status?: string;
    phase?: string;
    settings?: Record<string, any>;
    graph?: Record<string, any>;
    metadata?: Record<string, any>;
  };
  metadata?: {
    description?: string;
    tags?: string[];
    isMajorChange?: boolean;
    breakingChanges?: string[];
    [key: string]: any;
  };
}

/**
 * Version changes tracking
 */
export interface VersionChanges {
  nodesAdded?: string[];
  nodesRemoved?: string[];
  nodesModified?: string[];
  edgesAdded?: string[];
  edgesRemoved?: string[];
  edgesModified?: string[];
  configChanges?: Record<string, { old: any; new: any }>;
  summary?: string;
}

/**
 * Version comparison result
 */
export interface VersionComparison {
  fromVersion: number;
  toVersion: number;
  changes: VersionChanges;
  breakingChanges: string[];
  isCompatible: boolean;
}

/**
 * Execution compatibility check
 */
export interface ExecutionCompatibility {
  compatible: boolean;
  runningExecutions: number;
  warnings: string[];
  errors: string[];
}

/**
 * Workflow Snapshot Structure
 * Complete serializable snapshot of workflow state
 * 
 * This snapshot is stored in workflow_versions table:
 * - nodes_snapshot: JSONB array of all nodes
 * - edges_snapshot: JSONB array of all edges
 * - inputs_snapshot: JSONB object containing configuration
 * 
 * Rules:
 * - Snapshot must be built BEFORE saving version
 * - All fields (nodes, edges, configuration) must be populated
 * - Snapshot is immutable (deep cloned from source)
 */
export interface WorkflowSnapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  configuration: {
    workflowSettings?: Record<string, any>;  // Workflow-level settings (triggers, schedule, env)
    uiLayout?: Record<string, any>;          // UI layout (positions, zoom, panes)
    metadata?: Record<string, any>;          // Workflow metadata (name, status, phase, tags)
  };
}

/**
 * Workflow Version Manager
 */
export class WorkflowVersionManager {
  private supabase: ReturnType<typeof getSupabaseClient>;
  private tableName = 'workflow_versions';

  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Build workflow snapshot from current definition
   * Serializes nodes, edges, and configuration into a complete snapshot
   * 
   * @param currentDefinition - Current workflow definition
   * @returns Complete workflow snapshot
   */
  private buildWorkflowSnapshot(currentDefinition: {
    name: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    status?: string;
    phase?: string;
    settings?: Record<string, any>;
    graph?: Record<string, any>;
    metadata?: Record<string, any>;
  }): WorkflowSnapshot {
    // Validate required fields
    if (!Array.isArray(currentDefinition.nodes)) {
      throw new Error('Cannot build snapshot: nodes must be an array');
    }
    if (!Array.isArray(currentDefinition.edges)) {
      throw new Error('Cannot build snapshot: edges must be an array');
    }

    // Deep clone nodes and edges to ensure immutability
    const nodesSnapshot = JSON.parse(JSON.stringify(currentDefinition.nodes));
    const edgesSnapshot = JSON.parse(JSON.stringify(currentDefinition.edges));

    // Build configuration object
    const configuration = {
      workflowSettings: currentDefinition.settings || {},
      uiLayout: currentDefinition.graph || {},
      metadata: {
        name: currentDefinition.name,
        status: currentDefinition.status,
        phase: currentDefinition.phase,
        ...(currentDefinition.metadata || {}),
      },
    };

    return {
      nodes: nodesSnapshot,
      edges: edgesSnapshot,
      configuration,
    };
  }

  /**
   * Create new version on workflow update
   */
  async createVersion(
    workflowId: string,
    currentDefinition: {
      name: string;
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      status?: string;
      phase?: string;
      settings?: Record<string, any>;
      graph?: Record<string, any>;
      metadata?: Record<string, any>;
    },
    previousDefinition?: {
      name: string;
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      status?: string;
      phase?: string;
      settings?: Record<string, any>;
      graph?: Record<string, any>;
      metadata?: Record<string, any>;
    },
    createdBy?: string,
    metadata?: WorkflowVersion['metadata']
  ): Promise<WorkflowVersion> {
    // Get current version number
    const currentVersion = await this.getCurrentVersion(workflowId);
    const nextVersion = currentVersion ? currentVersion.version + 1 : 1;

    // ✅ BUILD SNAPSHOT: Serialize nodes, edges, and configuration before saving
    const snapshot = this.buildWorkflowSnapshot(currentDefinition);

    // Validate snapshot is complete
    if (!snapshot.nodes || snapshot.nodes.length === 0) {
      throw new Error('Cannot create version: workflow snapshot has no nodes');
    }
    if (!snapshot.edges || !Array.isArray(snapshot.edges)) {
      throw new Error('Cannot create version: workflow snapshot has invalid edges');
    }
    if (!snapshot.configuration) {
      throw new Error('Cannot create version: workflow snapshot has no configuration');
    }

    // Calculate changes if previous definition exists
    const changes = previousDefinition
      ? this.calculateChanges(previousDefinition, currentDefinition)
      : {
          summary: 'Initial version',
          nodesAdded: currentDefinition.nodes.map(n => n.id),
        };

    // Create version record (keep definitionSnapshot for backward compatibility)
    const version: WorkflowVersion = {
      workflowId,
      version: nextVersion,
      createdAt: new Date().toISOString(),
      createdBy,
      changes,
      definitionSnapshot: {
        name: currentDefinition.name,
        nodes: snapshot.nodes, // Use snapshot nodes
        edges: snapshot.edges, // Use snapshot edges
        status: currentDefinition.status,
        phase: currentDefinition.phase,
        settings: snapshot.configuration.workflowSettings,
        graph: snapshot.configuration.uiLayout,
        metadata: snapshot.configuration.metadata,
      },
      metadata,
    };

    // Store in database with separate snapshot columns
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert({
        workflow_id: workflowId,
        version: nextVersion,
        created_at: version.createdAt,
        created_by: createdBy,
        changes: changes as any,
        definition_snapshot: version.definitionSnapshot as any, // Keep for backward compatibility
        nodes_snapshot: snapshot.nodes, // ✅ REQUIRED: Populate nodes_snapshot
        edges_snapshot: snapshot.edges, // ✅ REQUIRED: Populate edges_snapshot
        inputs_snapshot: snapshot.configuration, // Store configuration as inputs_snapshot
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('[WorkflowVersioning] Failed to create version:', error);
      throw new Error(`Failed to create workflow version: ${error.message}`);
    }

    console.log(`[WorkflowVersioning] ✅ Created version ${nextVersion} for workflow ${workflowId}`);

    return version;
  }

  /**
   * Get current version of workflow
   */
  async getCurrentVersion(workflowId: string): Promise<WorkflowVersion | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('workflow_id', workflowId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No version found
        return null;
      }
      console.error('[WorkflowVersioning] Failed to get current version:', error);
      return null;
    }

    return this.mapDatabaseToVersion(data);
  }

  /**
   * Get specific version
   */
  async getVersion(workflowId: string, version: number): Promise<WorkflowVersion | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('version', version)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('[WorkflowVersioning] Failed to get version:', error);
      return null;
    }

    return this.mapDatabaseToVersion(data);
  }

  /**
   * Get version history
   */
  async getVersionHistory(workflowId: string, limit: number = 50): Promise<WorkflowVersion[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('workflow_id', workflowId)
      .order('version', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[WorkflowVersioning] Failed to get version history:', error);
      return [];
    }

    return (data || []).map(item => this.mapDatabaseToVersion(item));
  }

  /**
   * Rollback to previous version
   */
  async rollbackToVersion(
    workflowId: string,
    targetVersion: number,
    userId?: string
  ): Promise<{ success: boolean; newVersion: WorkflowVersion | null; error?: string }> {
    // Check for running executions
    const compatibility = await this.checkExecutionCompatibility(workflowId);
    if (!compatibility.compatible && compatibility.runningExecutions > 0) {
      return {
        success: false,
        newVersion: null,
        error: `Cannot rollback: ${compatibility.runningExecutions} execution(s) are currently running`,
      };
    }

    // Get target version
    const targetVersionData = await this.getVersion(workflowId, targetVersion);
    if (!targetVersionData) {
      return {
        success: false,
        newVersion: null,
        error: `Version ${targetVersion} not found`,
      };
    }

    // Get current workflow
    const { data: currentWorkflow, error: workflowError } = await this.supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError || !currentWorkflow) {
      return {
        success: false,
        newVersion: null,
        error: 'Failed to load current workflow',
      };
    }

    // Restore workflow from version snapshot
    const { error: updateError } = await this.supabase
      .from('workflows')
      .update({
        name: targetVersionData.definitionSnapshot.name,
        nodes: targetVersionData.definitionSnapshot.nodes,
        edges: targetVersionData.definitionSnapshot.edges,
        status: targetVersionData.definitionSnapshot.status,
        phase: targetVersionData.definitionSnapshot.phase,
        settings: targetVersionData.definitionSnapshot.settings || {},
      graph: targetVersionData.definitionSnapshot.graph || {},
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    if (updateError) {
      return {
        success: false,
        newVersion: null,
        error: `Failed to restore workflow: ${updateError.message}`,
      };
    }

    // Create new version from rollback
    const previousDefinition = {
      name: currentWorkflow.name,
      nodes: currentWorkflow.nodes || [],
      edges: currentWorkflow.edges || [],
      status: currentWorkflow.status,
      phase: currentWorkflow.phase,
      settings: currentWorkflow.settings || {},
      graph: currentWorkflow.graph || {},
      metadata: currentWorkflow.metadata,
    };

    const newVersion = await this.createVersion(
      workflowId,
      targetVersionData.definitionSnapshot,
      previousDefinition,
      userId,
      {
        description: `Rollback to version ${targetVersion}`,
        isMajorChange: true,
      }
    );

    console.log(`[WorkflowVersioning] ✅ Rolled back workflow ${workflowId} to version ${targetVersion}`);

    return {
      success: true,
      newVersion,
    };
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    workflowId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<VersionComparison | null> {
    const from = await this.getVersion(workflowId, fromVersion);
    const to = await this.getVersion(workflowId, toVersion);

    if (!from || !to) {
      return null;
    }

    const changes = this.calculateChanges(
      from.definitionSnapshot,
      to.definitionSnapshot
    );

    const breakingChanges = this.detectBreakingChanges(changes);
    const isCompatible = breakingChanges.length === 0;

    return {
      fromVersion,
      toVersion,
      changes,
      breakingChanges,
      isCompatible,
    };
  }

  /**
   * Check execution compatibility before update
   */
  async checkExecutionCompatibility(workflowId: string): Promise<ExecutionCompatibility> {
    // Check for running executions
    const { data: executions, error } = await this.supabase
      .from('executions')
      .select('id, status')
      .eq('workflow_id', workflowId)
      .in('status', ['running', 'pending', 'waiting']);

    if (error) {
      console.error('[WorkflowVersioning] Failed to check executions:', error);
      return {
        compatible: true, // Assume compatible if check fails
        runningExecutions: 0,
        warnings: [],
        errors: [],
      };
    }

    const runningExecutions = executions?.length || 0;
    const warnings: string[] = [];
    const errors: string[] = [];

    if (runningExecutions > 0) {
      errors.push(`${runningExecutions} execution(s) are currently running`);
    }

    return {
      compatible: runningExecutions === 0,
      runningExecutions,
      warnings,
      errors,
    };
  }

  /**
   * Calculate changes between two workflow definitions
   */
  private calculateChanges(
    previous: {
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      [key: string]: any;
    },
    current: {
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      [key: string]: any;
    }
  ): VersionChanges {
    const changes: VersionChanges = {
      nodesAdded: [],
      nodesRemoved: [],
      nodesModified: [],
      edgesAdded: [],
      edgesRemoved: [],
      edgesModified: [],
      configChanges: {},
    };

    // Compare nodes
    const previousNodeIds = new Set(previous.nodes.map(n => n.id));
    const currentNodeIds = new Set(current.nodes.map(n => n.id));

    // Find added nodes
    current.nodes.forEach(node => {
      if (!previousNodeIds.has(node.id)) {
        changes.nodesAdded!.push(node.id);
      }
    });

    // Find removed nodes
    previous.nodes.forEach(node => {
      if (!currentNodeIds.has(node.id)) {
        changes.nodesRemoved!.push(node.id);
      }
    });

    // Find modified nodes
    previous.nodes.forEach(prevNode => {
      const currNode = current.nodes.find(n => n.id === prevNode.id);
      if (currNode) {
        const prevConfig = JSON.stringify(prevNode.data?.config || {});
        const currConfig = JSON.stringify(currNode.data?.config || {});
        if (prevConfig !== currConfig) {
          changes.nodesModified!.push(prevNode.id);
          changes.configChanges![prevNode.id] = {
            old: prevNode.data?.config,
            new: currNode.data?.config,
          };
        }
      }
    });

    // Compare edges
    const previousEdgeIds = new Set(
      previous.edges.map(e => `${e.source}-${e.target}`)
    );
    const currentEdgeIds = new Set(
      current.edges.map(e => `${e.source}-${e.target}`)
    );

    // Find added edges
    current.edges.forEach(edge => {
      const edgeKey = `${edge.source}-${edge.target}`;
      if (!previousEdgeIds.has(edgeKey)) {
        changes.edgesAdded!.push(edge.id);
      }
    });

    // Find removed edges
    previous.edges.forEach(edge => {
      const edgeKey = `${edge.source}-${edge.target}`;
      if (!currentEdgeIds.has(edgeKey)) {
        changes.edgesRemoved!.push(edge.id);
      }
    });

    // Generate summary
    const summaryParts: string[] = [];
    if (changes.nodesAdded!.length > 0) {
      summaryParts.push(`Added ${changes.nodesAdded!.length} node(s)`);
    }
    if (changes.nodesRemoved!.length > 0) {
      summaryParts.push(`Removed ${changes.nodesRemoved!.length} node(s)`);
    }
    if (changes.nodesModified!.length > 0) {
      summaryParts.push(`Modified ${changes.nodesModified!.length} node(s)`);
    }
    if (changes.edgesAdded!.length > 0) {
      summaryParts.push(`Added ${changes.edgesAdded!.length} edge(s)`);
    }
    if (changes.edgesRemoved!.length > 0) {
      summaryParts.push(`Removed ${changes.edgesRemoved!.length} edge(s)`);
    }

    changes.summary = summaryParts.length > 0
      ? summaryParts.join(', ')
      : 'No changes detected';

    return changes;
  }

  /**
   * Detect breaking changes
   */
  private detectBreakingChanges(changes: VersionChanges): string[] {
    const breaking: string[] = [];

    // Node removal is breaking
    if (changes.nodesRemoved && changes.nodesRemoved.length > 0) {
      breaking.push(`Removed ${changes.nodesRemoved.length} node(s): ${changes.nodesRemoved.join(', ')}`);
    }

    // Edge removal is breaking
    if (changes.edgesRemoved && changes.edgesRemoved.length > 0) {
      breaking.push(`Removed ${changes.edgesRemoved.length} edge(s): ${changes.edgesRemoved.join(', ')}`);
    }

    // Major config changes might be breaking (heuristic)
    if (changes.configChanges) {
      Object.entries(changes.configChanges).forEach(([nodeId, change]) => {
        // Check if critical config fields changed
        const criticalFields = ['credential', 'api_key', 'endpoint', 'connection'];
        const hasCriticalChange = criticalFields.some(field =>
          JSON.stringify(change.old).includes(field) !== JSON.stringify(change.new).includes(field)
        );

        if (hasCriticalChange) {
          breaking.push(`Critical configuration changed in node ${nodeId}`);
        }
      });
    }

    return breaking;
  }

  /**
   * Map database record to WorkflowVersion
   */
  private mapDatabaseToVersion(data: any): WorkflowVersion {
    return {
      workflowId: data.workflow_id,
      version: data.version,
      createdAt: data.created_at,
      createdBy: data.created_by,
      changes: data.changes || {},
      definitionSnapshot: data.definition_snapshot || {},
      metadata: data.metadata || {},
    };
  }
}

// Export singleton instance
let workflowVersionManagerInstance: WorkflowVersionManager | null = null;

export function getWorkflowVersionManager(): WorkflowVersionManager {
  if (!workflowVersionManagerInstance) {
    workflowVersionManagerInstance = new WorkflowVersionManager();
  }
  return workflowVersionManagerInstance;
}

// Types are already exported above, no need to re-export
