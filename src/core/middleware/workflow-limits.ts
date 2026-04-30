import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from '../../services/subscription-service';
import { AuthenticatedRequest } from './subscription-auth';

export interface WorkflowLimitRequest extends AuthenticatedRequest {
  workflowLimitCheck?: {
    canCreate: boolean;
    currentCount: number;
    limit: number;
    planName: string;
    remainingWorkflows: number;
  };
}

/**
 * Middleware to check workflow creation limits
 */
export const checkWorkflowLimit = async (req: WorkflowLimitRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required for workflow creation',
        code: 'AUTH_REQUIRED'
      });
    }
    
    // Ensure user has a subscription
    await subscriptionService.ensureFreeSubscription(req.user.id);
    
    // Check if user can create workflow
    const canCreate = await subscriptionService.canCreateWorkflow(req.user.id);
    const usage = await subscriptionService.getSubscriptionUsage(req.user.id);
    
    // Add limit check info to request
    req.workflowLimitCheck = {
      canCreate,
      currentCount: usage.workflowsUsed,
      limit: usage.workflowLimit,
      planName: req.user.subscriptionPlan || 'Free',
      remainingWorkflows: usage.remainingWorkflows
    };
    
    if (!canCreate) {
      return res.status(403).json({
        error: 'Workflow Limit Exceeded',
        message: `You've reached your workflow limit (${usage.workflowLimit}). Upgrade your plan to create more workflows.`,
        code: 'WORKFLOW_LIMIT_EXCEEDED',
        currentPlan: req.user.subscriptionPlan || 'Free',
        workflowsUsed: usage.workflowsUsed,
        workflowLimit: usage.workflowLimit,
        upgradeUrl: '/subscriptions',
        suggestedPlans: usage.workflowLimit <= 2 ? ['Pro', 'Enterprise'] : ['Enterprise']
      });
    }
    
    next();
  } catch (error: any) {
    console.error('[WorkflowLimits] Check workflow limit error:', error);
    res.status(500).json({
      error: 'Workflow Limit Check Failed',
      message: 'Unable to verify workflow creation limits',
      code: 'LIMIT_CHECK_ERROR'
    });
  }
};

/**
 * Middleware to enforce workflow limits (blocks request if limit exceeded)
 */
export const enforceWorkflowLimit = async (req: WorkflowLimitRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required for workflow creation',
        code: 'AUTH_REQUIRED'
      });
    }
    
    // Check workflow limit first
    await checkWorkflowLimit(req, res, () => {
      // If checkWorkflowLimit passes, increment the count
      subscriptionService.incrementWorkflowCount(req.user!.id)
        .then(success => {
          if (!success) {
            return res.status(500).json({
              error: 'Workflow Count Update Failed',
              message: 'Failed to update workflow count',
              code: 'COUNT_UPDATE_ERROR'
            });
          }
          next();
        })
        .catch(error => {
          console.error('[WorkflowLimits] Increment workflow count error:', error);
          res.status(500).json({
            error: 'Workflow Count Error',
            message: 'Failed to track workflow creation',
            code: 'COUNT_ERROR'
          });
        });
    });
  } catch (error: any) {
    console.error('[WorkflowLimits] Enforce workflow limit error:', error);
    res.status(500).json({
      error: 'Workflow Limit Enforcement Failed',
      message: 'Unable to enforce workflow creation limits',
      code: 'LIMIT_ENFORCEMENT_ERROR'
    });
  }
};

/**
 * Middleware to decrement workflow count (for workflow deletion)
 */
export const decrementWorkflowCount = async (req: WorkflowLimitRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(); // Skip if no user (optional middleware)
    }
    
    const success = await subscriptionService.decrementWorkflowCount(req.user.id);
    
    if (!success) {
      console.warn(`[WorkflowLimits] Failed to decrement workflow count for user ${req.user.id}`);
    }
    
    next();
  } catch (error: any) {
    console.error('[WorkflowLimits] Decrement workflow count error:', error);
    // Don't fail the request, just log the error
    next();
  }
};

/**
 * Middleware to get workflow usage info (non-blocking)
 */
export const getWorkflowUsage = async (req: WorkflowLimitRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next();
    }
    
    const usage = await subscriptionService.getSubscriptionUsage(req.user.id);
    
    req.workflowLimitCheck = {
      canCreate: usage.remainingWorkflows > 0,
      currentCount: usage.workflowsUsed,
      limit: usage.workflowLimit,
      planName: req.user.subscriptionPlan || 'Free',
      remainingWorkflows: usage.remainingWorkflows
    };
    
    next();
  } catch (error: any) {
    console.error('[WorkflowLimits] Get workflow usage error:', error);
    // Don't fail the request, just continue without usage info
    next();
  }
};

/**
 * Middleware for subscription plan-based feature access
 */
export const requirePlan = (allowedPlans: string[]) => {
  return (req: WorkflowLimitRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    
    const userPlan = req.user.subscriptionPlan || 'Free';
    
    if (!allowedPlans.includes(userPlan)) {
      return res.status(403).json({
        error: 'Plan Upgrade Required',
        message: `This feature requires a ${allowedPlans.join(' or ')} subscription`,
        code: 'PLAN_UPGRADE_REQUIRED',
        currentPlan: userPlan,
        requiredPlans: allowedPlans,
        upgradeUrl: '/subscriptions'
      });
    }
    
    next();
  };
};

/**
 * Middleware to check workflow limit without blocking (for warnings)
 */
export const checkWorkflowLimitWarning = async (req: WorkflowLimitRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next();
    }
    
    const usage = await subscriptionService.getSubscriptionUsage(req.user.id);
    
    // Add usage info to response headers for frontend warnings
    res.set({
      'X-Workflow-Used': usage.workflowsUsed.toString(),
      'X-Workflow-Limit': usage.workflowLimit.toString(),
      'X-Workflow-Remaining': usage.remainingWorkflows.toString(),
      'X-Workflow-Utilization': usage.utilizationPercentage.toString()
    });
    
    // Add warning if approaching limit (80% or higher)
    if (usage.utilizationPercentage >= 80) {
      res.set('X-Workflow-Warning', 'approaching-limit');
    }
    
    // Add critical warning if at limit
    if (usage.remainingWorkflows === 0) {
      res.set('X-Workflow-Warning', 'limit-exceeded');
    }
    
    next();
  } catch (error: any) {
    console.error('[WorkflowLimits] Check workflow limit warning error:', error);
    // Don't fail the request, just continue without warnings
    next();
  }
};

/**
 * Utility function to validate workflow ownership and limits
 */
export const validateWorkflowAccess = async (userId: string, workflowId: string): Promise<{
  canAccess: boolean;
  reason?: string;
  code?: string;
}> => {
  try {
    // This would typically check if the workflow belongs to the user
    // and if they have access based on their subscription
    // For now, we'll implement basic validation
    
    const usage = await subscriptionService.getSubscriptionUsage(userId);
    
    // Basic validation - user can access if they have any workflows
    if (usage.workflowsUsed === 0) {
      return {
        canAccess: false,
        reason: 'No workflows found for user',
        code: 'NO_WORKFLOWS'
      };
    }
    
    return {
      canAccess: true
    };
  } catch (error: any) {
    console.error('[WorkflowLimits] Validate workflow access error:', error);
    return {
      canAccess: false,
      reason: 'Failed to validate workflow access',
      code: 'VALIDATION_ERROR'
    };
  }
};

/**
 * Express middleware to validate workflow access
 */
export const validateWorkflowAccessMiddleware = (workflowIdParam: string = 'workflowId') => {
  return async (req: WorkflowLimitRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      const workflowId = req.params[workflowIdParam];
      
      if (!workflowId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Workflow ID is required',
          code: 'MISSING_WORKFLOW_ID'
        });
      }
      
      const validation = await validateWorkflowAccess(req.user.id, workflowId);
      
      if (!validation.canAccess) {
        return res.status(403).json({
          error: 'Workflow Access Denied',
          message: validation.reason || 'Access denied to this workflow',
          code: validation.code || 'ACCESS_DENIED'
        });
      }
      
      next();
    } catch (error: any) {
      console.error('[WorkflowLimits] Validate workflow access middleware error:', error);
      res.status(500).json({
        error: 'Workflow Access Validation Failed',
        message: 'Unable to validate workflow access',
        code: 'ACCESS_VALIDATION_ERROR'
      });
    }
  };
};

/**
 * Endpoint handler for workflow limit check (used directly as route handler)
 */
export const checkWorkflowLimitEndpoint = async (req: WorkflowLimitRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    await subscriptionService.ensureFreeSubscription(req.user.id);
    const canCreate = await subscriptionService.canCreateWorkflow(req.user.id);
    const usage = await subscriptionService.getSubscriptionUsage(req.user.id);

    return res.json({
      success: true,
      canCreate,
      workflowsUsed: usage.workflowsUsed,
      workflowLimit: usage.workflowLimit,
      remainingWorkflows: usage.remainingWorkflows,
      utilizationPercentage: usage.utilizationPercentage,
      currentPlan: req.user.subscriptionPlan || 'Free',
      upgradeMessage: !canCreate
        ? `You've reached your workflow limit (${usage.workflowLimit}). Upgrade to create more workflows.`
        : null,
      suggestedPlans: !canCreate
        ? (usage.workflowLimit <= 2 ? ['Pro', 'Enterprise'] : ['Enterprise'])
        : null
    });
  } catch (error: any) {
    console.error('[WorkflowLimits] checkWorkflowLimitEndpoint error:', error);
    return res.status(500).json({
      error: 'Workflow Limit Check Failed',
      message: 'Unable to verify workflow creation limits',
      code: 'LIMIT_CHECK_ERROR'
    });
  }
};

/**
 * Blocks AI workflow generation when the user has no remaining workflow slots.
 * Manual builder pages may still open, but all creation/save endpoints remain
 * protected separately.
 */
export const requireWorkflowCapacityForAi = async (req: WorkflowLimitRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required for AI workflow generation',
        code: 'AUTH_REQUIRED'
      });
    }

    await subscriptionService.ensureFreeSubscription(req.user.id);
    const usage = await subscriptionService.getSubscriptionUsage(req.user.id);

    if (usage.remainingWorkflows <= 0) {
      return res.status(403).json({
        success: false,
        error: 'Workflow Limit Exceeded',
        message: `You've reached your workflow limit (${usage.workflowLimit}). Upgrade your plan to generate more workflows with AI.`,
        code: 'WORKFLOW_LIMIT_EXCEEDED',
        workflowsUsed: usage.workflowsUsed,
        workflowLimit: usage.workflowLimit,
        remainingWorkflows: usage.remainingWorkflows,
        upgradeUrl: '/subscriptions',
        suggestedPlans: usage.workflowLimit <= 2 ? ['Pro', 'Enterprise'] : ['Enterprise']
      });
    }

    next();
  } catch (error: any) {
    console.error('[WorkflowLimits] requireWorkflowCapacityForAi error:', error);
    return res.status(500).json({
      success: false,
      error: 'Workflow Limit Check Failed',
      message: 'Unable to verify workflow creation limits',
      code: 'LIMIT_CHECK_ERROR'
    });
  }
};
