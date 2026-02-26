-- ============================================
-- Continuous Learning System Database Schema
-- ============================================
-- Run this in Supabase SQL Editor
-- Supports automatic feedback collection and model training

-- ============================================
-- Workflow Feedback Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.workflow_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    user_prompt TEXT NOT NULL,
    generated_workflow JSONB NOT NULL,
    execution_result JSONB,
    user_actions JSONB DEFAULT '{"modified": false, "deleted": false, "recreated": false}'::jsonb,
    quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    used_for_training BOOLEAN DEFAULT false,
    training_batch_id UUID,
    
    -- Indexes for performance
    CONSTRAINT workflow_feedback_workflow_id_fkey FOREIGN KEY (workflow_id) 
        REFERENCES public.workflows(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_feedback_workflow_id ON public.workflow_feedback(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_feedback_used_for_training ON public.workflow_feedback(used_for_training);
CREATE INDEX IF NOT EXISTS idx_workflow_feedback_quality_score ON public.workflow_feedback(quality_score);
CREATE INDEX IF NOT EXISTS idx_workflow_feedback_created_at ON public.workflow_feedback(created_at);

-- ============================================
-- Training Batches Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.training_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_version VARCHAR(100) NOT NULL,
    example_count INTEGER NOT NULL,
    accuracy_before DECIMAL(5, 4),
    accuracy_after DECIMAL(5, 4),
    consistency_score DECIMAL(5, 4),
    deployed BOOLEAN DEFAULT false,
    deployment_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    training_duration_ms INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_batches_deployed ON public.training_batches(deployed);
CREATE INDEX IF NOT EXISTS idx_training_batches_created_at ON public.training_batches(created_at);

-- ============================================
-- Model Performance Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS public.model_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_version VARCHAR(100) NOT NULL,
    metric_name VARCHAR(50) NOT NULL, -- 'accuracy', 'consistency', 'speed', etc.
    metric_value DECIMAL(10, 4) NOT NULL,
    test_set_size INTEGER,
    measured_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_model_performance_model_version ON public.model_performance(model_version);
CREATE INDEX IF NOT EXISTS idx_model_performance_measured_at ON public.model_performance(measured_at);

-- ============================================
-- User Satisfaction Tracking (Optional)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_satisfaction (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES public.executions(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    feedback_text TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_satisfaction_workflow_id ON public.user_satisfaction(workflow_id);
CREATE INDEX IF NOT EXISTS idx_user_satisfaction_rating ON public.user_satisfaction(rating);

-- ============================================
-- Functions
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workflow_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_workflow_feedback_updated_at
    BEFORE UPDATE ON public.workflow_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_feedback_updated_at();

-- Function to get high-quality examples for training
CREATE OR REPLACE FUNCTION get_quality_training_examples(
    min_quality_score INTEGER DEFAULT 3,
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    user_prompt TEXT,
    generated_workflow JSONB,
    quality_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        wf.id,
        wf.user_prompt,
        wf.generated_workflow,
        wf.quality_score
    FROM public.workflow_feedback wf
    WHERE 
        wf.used_for_training = false
        AND wf.quality_score >= min_quality_score
        AND (wf.execution_result->>'success')::boolean = true
        AND (wf.user_actions->>'modified')::boolean = false
        AND (wf.user_actions->>'deleted')::boolean = false
    ORDER BY wf.quality_score DESC, wf.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate average quality score
CREATE OR REPLACE FUNCTION get_average_quality_score()
RETURNS DECIMAL AS $$
BEGIN
    RETURN (
        SELECT AVG(quality_score)::DECIMAL(5, 2)
        FROM public.workflow_feedback
        WHERE quality_score IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Views
-- ============================================

-- View: Training Statistics
CREATE OR REPLACE VIEW training_statistics AS
SELECT 
    COUNT(*) FILTER (WHERE used_for_training = false) as pending_examples,
    COUNT(*) FILTER (WHERE used_for_training = true) as used_examples,
    COUNT(*) FILTER (WHERE quality_score >= 4) as high_quality_examples,
    AVG(quality_score)::DECIMAL(5, 2) as avg_quality_score,
    COUNT(*) as total_examples
FROM public.workflow_feedback;

-- View: Model Performance Summary
CREATE OR REPLACE VIEW model_performance_summary AS
SELECT 
    model_version,
    COUNT(*) as training_runs,
    MAX(accuracy_after) as best_accuracy,
    MAX(created_at) as last_training,
    COUNT(*) FILTER (WHERE deployed = true) as deployments
FROM public.training_batches
GROUP BY model_version
ORDER BY last_training DESC;

-- ============================================
-- Sample Queries
-- ============================================

-- Get examples ready for training
-- SELECT * FROM get_quality_training_examples(3, 50);

-- Check training statistics
-- SELECT * FROM training_statistics;

-- Check model performance
-- SELECT * FROM model_performance_summary;

-- Get recent feedback
-- SELECT 
--     wf.id,
--     wf.user_prompt,
--     wf.quality_score,
--     wf.execution_result->>'success' as success,
--     wf.created_at
-- FROM workflow_feedback wf
-- ORDER BY wf.created_at DESC
-- LIMIT 20;

RAISE NOTICE '✅ Continuous Learning database schema created successfully!';
