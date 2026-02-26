#!/usr/bin/env python3
"""
Advanced Fine-Tuning Script for Ollama Models using Unsloth
Provides maximum control over training process

Requirements:
    pip install unsloth transformers datasets accelerate bitsandbytes

Usage:
    python train-with-unsloth.py
"""

import os
import json
import sys
from pathlib import Path

try:
    from unsloth import FastLanguageModel, is_bfloat16_supported
    from unsloth import is_bfloat16_supported
    from trl import SFTTrainer
    from transformers import TrainingArguments
    from datasets import load_dataset
    import torch
except ImportError as e:
    print(f"❌ Missing dependencies: {e}")
    print("Install with: pip install unsloth transformers datasets accelerate bitsandbytes")
    sys.exit(1)

# Configuration
BASE_MODEL = os.getenv("BASE_MODEL", "unsloth/llama-3.2-3b-Instruct")
FINE_TUNED_MODEL = os.getenv("FINE_TUNED_MODEL", "ctrlchecks-workflow-builder")
TRAINING_DATA_PATH = os.getenv("TRAINING_DATA_PATH", "../data/training_data.jsonl")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "../models/ctrlchecks-workflow-builder")
MAX_SEQ_LENGTH = int(os.getenv("MAX_SEQ_LENGTH", "4096"))
EPOCHS = int(os.getenv("EPOCHS", "3"))
LEARNING_RATE = float(os.getenv("LEARNING_RATE", "2e-5"))
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "4"))

def load_training_data(jsonl_path: str):
    """Load training data from JSONL file"""
    print(f"📊 Loading training data from {jsonl_path}...")
    
    if not os.path.exists(jsonl_path):
        raise FileNotFoundError(f"Training data not found: {jsonl_path}")
    
    examples = []
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                example = json.loads(line)
                examples.append(example)
            except json.JSONDecodeError as e:
                print(f"⚠️  Skipping invalid JSON line: {e}")
                continue
    
    print(f"✅ Loaded {len(examples)} training examples")
    return examples

def format_prompt(example):
    """Format training example into prompt"""
    messages = example.get("messages", [])
    
    # Extract system, user, and assistant messages
    system_msg = ""
    user_msg = ""
    assistant_msg = ""
    
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        
        if role == "system":
            system_msg = content
        elif role == "user":
            user_msg = content
        elif role == "assistant":
            assistant_msg = content
    
    # Format as instruction-following prompt
    prompt = f"""<|begin_of_text|><|start_header_id|>system<|end_header_id|>

{system_msg}<|eot_id|><|start_header_id|>user<|end_header_id|>

{user_msg}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

{assistant_msg}<|eot_id|>"""
    
    return {"text": prompt}

def main():
    print("🚀 Starting Unsloth Fine-Tuning Pipeline\n")
    print(f"   Base Model: {BASE_MODEL}")
    print(f"   Output Model: {FINE_TUNED_MODEL}")
    print(f"   Training Data: {TRAINING_DATA_PATH}")
    print(f"   Epochs: {EPOCHS}")
    print(f"   Learning Rate: {LEARNING_RATE}")
    print(f"   Batch Size: {BATCH_SIZE}\n")
    
    # Step 1: Load and prepare training data
    training_examples = load_training_data(TRAINING_DATA_PATH)
    
    if len(training_examples) == 0:
        print("❌ No training examples found!")
        sys.exit(1)
    
    # Convert to dataset format
    formatted_data = [format_prompt(ex) for ex in training_examples]
    
    # Save formatted data temporarily
    temp_jsonl = "/tmp/training_formatted.jsonl"
    with open(temp_jsonl, 'w', encoding='utf-8') as f:
        for item in formatted_data:
            f.write(json.dumps(item) + "\n")
    
    # Load dataset
    dataset = load_dataset("json", data_files=temp_jsonl, split="train")
    print(f"✅ Dataset loaded: {len(dataset)} examples\n")
    
    # Step 2: Load model
    print("📦 Loading base model...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=MAX_SEQ_LENGTH,
        dtype=None,  # Auto-detect
        load_in_4bit=True,  # 4-bit quantization for memory efficiency
    )
    print("✅ Model loaded\n")
    
    # Step 3: Configure for training
    print("⚙️  Configuring model for training...")
    model = FastLanguageModel.get_peft_model(
        model,
        r=16,  # LoRA rank
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                       "gate_proj", "up_proj", "down_proj"],
        lora_alpha=16,
        lora_dropout=0.1,
        bias="none",
        use_gradient_checkpointing=True,
        random_state=3407,
    )
    print("✅ Model configured\n")
    
    # Step 4: Setup tokenizer
    tokenizer = FastLanguageModel.get_peft_tokenizer(model, tokenizer)
    
    # Step 5: Training arguments
    print("📝 Setting up training arguments...")
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LENGTH,
        packing=False,
        args=TrainingArguments(
            per_device_train_batch_size=BATCH_SIZE,
            gradient_accumulation_steps=4,
            warmup_steps=5,
            num_train_epochs=EPOCHS,
            learning_rate=LEARNING_RATE,
            fp16=not is_bfloat16_supported(),
            bf16=is_bfloat16_supported(),
            logging_steps=1,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="linear",
            seed=3407,
            output_dir=OUTPUT_DIR,
            save_strategy="epoch",
            save_total_limit=3,
        ),
    )
    print("✅ Training setup complete\n")
    
    # Step 6: Train
    print("🎓 Starting training...")
    print("   This may take a while depending on dataset size and epochs\n")
    
    trainer_stats = trainer.train()
    
    print("\n✅ Training complete!")
    print(f"   Training loss: {trainer_stats.training_loss:.4f}\n")
    
    # Step 7: Save model
    print("💾 Saving fine-tuned model...")
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"✅ Model saved to {OUTPUT_DIR}\n")
    
    # Step 8: Export to Ollama format (if ollama-ft is available)
    print("📦 Exporting to Ollama format...")
    try:
        FastLanguageModel.for_inference(model)  # Enable inference mode
        
        # Note: Actual Ollama export requires additional steps
        # You may need to use ollama-ft or convert manually
        print("⚠️  Manual conversion to Ollama format required")
        print("   Use: ollama-ft convert or follow Ollama export guide")
    except Exception as e:
        print(f"⚠️  Export step skipped: {e}")
    
    print("\n✅ Fine-tuning pipeline complete!")
    print(f"\n📝 Next steps:")
    print(f"   1. Test the model: python -c \"from transformers import AutoModelForCausalLM; model = AutoModelForCausalLM.from_pretrained('{OUTPUT_DIR}')\"")
    print(f"   2. Convert to Ollama format using ollama-ft")
    print(f"   3. Update environment variables to use fine-tuned model")
    print(f"   4. Restart your worker service")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Training interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Training failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
