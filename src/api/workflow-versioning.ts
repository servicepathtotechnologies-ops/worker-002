/**
 * Workflow Versioning API
 * Manage workflow versions and compatibility
 */

import { Request, Response } from 'express';
import { WorkflowVersioning } from '../services/ai/workflow-versioning';
// Handlers are wrapped with asyncHandler in index.ts

const versioning = new WorkflowVersioning();

/**
 * POST /api/workflow/version
 * Version a workflow
 */
export const versionWorkflow = async (req: Request, res: Response) => {
  const { workflow, metadata } = req.body;

  if (!workflow || !workflow.nodes) {
    return res.status(400).json({
      error: 'Workflow is required',
      details: 'Workflow must contain nodes array'
    });
  }

  const version = versioning.versionWorkflow(workflow, metadata);

  res.json({
    success: true,
    version: {
      id: version.version_id,
      hash: version.full_hash,
      created_at: version.created_at,
      dependencies: version.dependencies,
      compatibility: version.compatibility
    }
  });
};

/**
 * GET /api/workflow/version/:versionId
 * Get specific version
 */
export const getVersion = async (req: Request, res: Response) => {
  const { versionId } = req.params;

  try {
    const version = versioning.getVersion(versionId);
    res.json({
      success: true,
      version
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: error.message || 'Version not found'
    });
  }
};

/**
 * GET /api/workflow/version/:versionId/metadata
 * Get version metadata only
 */
export const getVersionMetadata = async (req: Request, res: Response) => {
  const { versionId } = req.params;

  try {
    const metadata = versioning.getVersionMetadata(versionId);
    res.json({
      success: true,
      metadata
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: error.message || 'Version not found'
    });
  }
};

/**
 * POST /api/workflow/version/diff
 * Diff two versions
 */
export const diffVersions = async (req: Request, res: Response) => {
  const { versionA, versionB } = req.body;

  if (!versionA || !versionB) {
    return res.status(400).json({
      error: 'Both versionA and versionB are required'
    });
  }

  try {
    const diff = versioning.diffVersions(versionA, versionB);
    res.json({
      success: true,
      diff
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to diff versions'
    });
  }
};

/**
 * GET /api/workflow/versions
 * List all versions
 */
export const listVersions = async (req: Request, res: Response) => {
  const versions = versioning.listVersions();
  res.json({
    success: true,
    versions,
    count: versions.length
  });
};
