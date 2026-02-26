-- ============================================
-- Generate 300+ Sample Execution Records
-- Run this in Supabase SQL Editor
-- ============================================

-- First, create a test workflow if it doesn't exist
DO $$
DECLARE
    test_workflow_id UUID;
    execution_id UUID;
    node_id TEXT;
    node_type TEXT;
    node_name TEXT;
    sequence_num INT;
    output_data JSONB;
    i INT;
    j INT;
BEGIN
    -- Create test workflow
    INSERT INTO workflows (id, name, definition, is_active)
    VALUES (
        gen_random_uuid(),
        'Test Workflow - Enterprise Architecture',
        '{
            "nodes": [
                {"id": "trigger-1", "type": "manual_trigger", "label": "Start"},
                {"id": "node-1", "type": "text_formatter", "label": "Format Text"},
                {"id": "node-2", "type": "chat_model", "label": "AI Chat"},
                {"id": "node-3", "type": "if_else", "label": "Condition"},
                {"id": "node-4", "type": "set_variable", "label": "Set Var"},
                {"id": "node-5", "type": "http_request", "label": "HTTP Call"}
            ],
            "edges": [
                {"id": "e1", "source": "trigger-1", "target": "node-1"},
                {"id": "e2", "source": "node-1", "target": "node-2"},
                {"id": "e3", "source": "node-2", "target": "node-3"},
                {"id": "e4", "source": "node-3", "target": "node-4"},
                {"id": "e5", "source": "node-4", "target": "node-5"}
            ]
        }'::jsonb,
        true
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO test_workflow_id;

    -- Get existing test workflow or use the one we just created
    SELECT id INTO test_workflow_id
    FROM workflows
    WHERE name = 'Test Workflow - Enterprise Architecture'
    LIMIT 1;

    RAISE NOTICE 'Using workflow ID: %', test_workflow_id;

    -- Generate 300 executions
    FOR i IN 1..300 LOOP
        execution_id := gen_random_uuid();
        
        -- Create execution
        INSERT INTO executions (
            id,
            workflow_id,
            user_id,
            status,
            trigger,
            input,
            started_at,
            finished_at,
            current_node,
            step_outputs
        ) VALUES (
            execution_id,
            test_workflow_id,
            gen_random_uuid(),
            CASE 
                WHEN i % 30 = 0 THEN 'running'  -- Every 30th for resume testing
                WHEN i % 20 = 0 THEN 'failed'    -- Every 20th has failures
                ELSE 'success'
            END,
            'manual',
            jsonb_build_object('test', true, 'executionNumber', i),
            NOW() - (random() * INTERVAL '7 days'),
            CASE 
                WHEN i % 30 = 0 THEN NULL  -- Running executions don't have finished_at
                ELSE NOW() - (random() * INTERVAL '7 days') + INTERVAL '5 seconds'
            END,
            CASE 
                WHEN i % 30 = 0 THEN 'node-3'  -- Resume test stops at node-3
                ELSE 'node-5'
            END,
            '{}'::jsonb  -- Will be populated by steps
        );

        -- Create node execution steps
        FOR j IN 1..5 LOOP
            node_id := 'node-' || j;
            sequence_num := j;
            
            -- Determine node type
            CASE j
                WHEN 1 THEN 
                    node_type := 'text_formatter';
                    node_name := 'Format Text';
                    output_data := jsonb_build_object(
                        'data', 'Formatted text output ' || i || '-' || j,
                        'formatted', '[' || j || '] Formatted: Sample text',
                        'timestamp', NOW()::text,
                        'sequence', j
                    );
                WHEN 2 THEN 
                    node_type := 'chat_model';
                    node_name := 'AI Chat';
                    output_data := jsonb_build_object(
                        'response', 'AI response for execution ' || i || ' sequence ' || j,
                        'tokens', (random() * 1000 + 100)::int,
                        'model', 'gpt-4',
                        'timestamp', NOW()::text,
                        'sequence', j
                    );
                WHEN 3 THEN 
                    node_type := 'if_else';
                    node_name := 'Condition';
                    output_data := jsonb_build_object(
                        'condition', (i % 2 = 0),
                        'result', CASE WHEN i % 2 = 0 THEN 'true' ELSE 'false' END,
                        'timestamp', NOW()::text,
                        'sequence', j
                    );
                WHEN 4 THEN 
                    node_type := 'set_variable';
                    node_name := 'Set Var';
                    -- Every 10th execution has large payload (simulated with reference)
                    IF i % 10 = 0 THEN
                        output_data := jsonb_build_object(
                            '_storage', 's3',
                            '_key', 'executions/' || execution_id || '/node-4/output.json',
                            '_url', 's3://workflow-executions/executions/' || execution_id || '/node-4/output.json'
                        );
                    ELSE
                        output_data := jsonb_build_object(
                            'variable', 'var_' || i || '_' || j,
                            'value', 'value_' || i || '_' || j,
                            'timestamp', NOW()::text,
                            'sequence', j
                        );
                    END IF;
                WHEN 5 THEN 
                    node_type := 'http_request';
                    node_name := 'HTTP Call';
                    output_data := jsonb_build_object(
                        'status', 200,
                        'data', jsonb_build_object('result', 'HTTP response ' || i || '-' || j),
                        'headers', jsonb_build_object('content-type', 'application/json'),
                        'timestamp', NOW()::text,
                        'sequence', j
                    );
            END CASE;

            -- Skip steps after node-3 for resume test executions
            IF i % 30 = 0 AND j > 3 THEN
                EXIT;  -- Don't create steps after node-3
            END IF;

            -- Determine if node should fail (for failed executions)
            DECLARE
                node_status TEXT;
                node_error TEXT;
            BEGIN
                IF i % 20 = 0 AND j = 3 THEN
                    node_status := 'failed';
                    node_error := 'Error in node ' || node_id;
                    output_data := NULL;
                ELSE
                    node_status := 'success';
                    node_error := NULL;
                END IF;

                -- Insert execution step
                INSERT INTO execution_steps (
                    execution_id,
                    node_id,
                    node_name,
                    node_type,
                    input_json,
                    output_json,
                    status,
                    error,
                    sequence,
                    completed_at
                ) VALUES (
                    execution_id,
                    node_id,
                    node_name,
                    node_type,
                    jsonb_build_object('input', 'Input for ' || node_id),
                    output_data,
                    node_status,
                    node_error,
                    sequence_num,
                    NOW() - (random() * INTERVAL '7 days') + (j * INTERVAL '1 second')
                );
            END;
        END LOOP;

        -- Update execution with step_outputs aggregate
        UPDATE executions
        SET step_outputs = (
            SELECT jsonb_object_agg(node_id, output_json)
            FROM execution_steps
            WHERE execution_id = executions.id
            AND output_json IS NOT NULL
        )
        WHERE id = execution_id;

        -- Progress indicator
        IF i % 50 = 0 THEN
            RAISE NOTICE 'Generated % executions...', i;
        END IF;
    END LOOP;

    RAISE NOTICE '✅ Successfully generated 300 executions!';
    RAISE NOTICE '📊 Summary:';
    RAISE NOTICE '   - Total executions: 300';
    RAISE NOTICE '   - Large payload executions: 30 (every 10th)';
    RAISE NOTICE '   - Failed node executions: 15 (every 20th)';
    RAISE NOTICE '   - Resume test executions: 10 (every 30th)';
    RAISE NOTICE '   - Workflow ID: %', test_workflow_id;
END $$;

-- Verify the data
SELECT 
    COUNT(*) as total_executions,
    COUNT(CASE WHEN status = 'running' THEN 1 END) as running_executions,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_executions,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as success_executions
FROM executions
WHERE workflow_id IN (
    SELECT id FROM workflows WHERE name = 'Test Workflow - Enterprise Architecture'
);

-- Show sample execution with steps
SELECT 
    e.id as execution_id,
    e.status,
    e.current_node,
    COUNT(es.id) as step_count,
    jsonb_object_keys(e.step_outputs) as node_ids
FROM executions e
LEFT JOIN execution_steps es ON es.execution_id = e.id
WHERE e.workflow_id IN (
    SELECT id FROM workflows WHERE name = 'Test Workflow - Enterprise Architecture'
)
GROUP BY e.id, e.status, e.current_node, e.step_outputs
LIMIT 10;
