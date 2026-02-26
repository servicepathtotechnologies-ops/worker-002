/**
 * Node Contract API Endpoint
 * Serves canonical node library for workflow compiler
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
// Handlers are wrapped with asyncHandler in index.ts

let nodeLibraryCache: any = null;
let lastModified: Date | null = null;

/**
 * Load node library with caching
 */
function loadNodeLibrary() {
  const libraryPath = path.join(__dirname, '../../data/node-library.v1.json');
  
  // Check if file was modified
  const stats = fs.statSync(libraryPath);
  if (!lastModified || stats.mtime > lastModified) {
    const libraryData = fs.readFileSync(libraryPath, 'utf-8');
    nodeLibraryCache = JSON.parse(libraryData);
    lastModified = stats.mtime;
  }
  
  return nodeLibraryCache;
}

/**
 * GET /api/node-contract
 * Returns full node library
 */
export const getNodeContract = async (req: Request, res: Response) => {
  const library = loadNodeLibrary();
  
  // Set cache headers for immutable content
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Node-Library-Version', library.version);
  res.setHeader('X-Last-Updated', library.last_updated);
  
  res.json(library);
};

/**
 * GET /api/node-contract/:nodeType
 * Returns specific node definition
 */
export const getNodeContractByType = async (req: Request, res: Response) => {
  const { nodeType } = req.params;
  const library = loadNodeLibrary();
  
  // Find node by nodeType or by key
  let nodeDef = null;
  
  // Check if it's a key in the nodes object
  if (library.nodes[nodeType]) {
    nodeDef = library.nodes[nodeType];
  } else {
    // Search by nodeType property
    for (const key in library.nodes) {
      if (library.nodes[key].nodeType === nodeType) {
        nodeDef = library.nodes[key];
        break;
      }
    }
  }
  
  if (!nodeDef) {
    return res.status(404).json({
      error: 'Node type not found',
      nodeType,
      availableNodes: Object.keys(library.nodes)
    });
  }
  
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Type', 'application/json');
  
  res.json(nodeDef);
};

/**
 * GET /api/node-contract/version
 * Returns library version info
 */
export const getNodeContractVersion = async (req: Request, res: Response) => {
  const library = loadNodeLibrary();
  
  res.json({
    version: library.version,
    schema_version: library.schema_version,
    last_updated: library.last_updated,
    total_nodes: library.total_nodes,
    categories: Object.keys(library.categories || {}),
    patterns: Object.keys(library.patterns || {}),
    forbidden_nodes: library.forbidden_nodes || []
  });
};

/**
 * GET /api/node-contract/patterns
 * Returns available workflow patterns
 */
export const getNodeContractPatterns = async (req: Request, res: Response) => {
  const library = loadNodeLibrary();
  
  res.json({
    patterns: library.patterns || {},
    categories: library.categories || {}
  });
};
