# 🎯 Fine-Tuning Guide - Complete Explanation

## 📖 What is Fine-Tuning?

**Fine-tuning** is like teaching a smart AI model to be better at your specific job. Think of it like this:

- **Base Model** (like `qwen2.5:14b-instruct-q4_K_M`) = A general-purpose AI that knows many things
- **Fine-Tuned Model** = The same AI, but trained on YOUR specific examples to be better at YOUR tasks

### Why Fine-Tuning?

Without fine-tuning:
- The AI uses generic knowledge
- It might not understand your specific workflow patterns
- Responses may need more corrections

With fine-tuning:
- The AI "remembers" your workflow patterns
- It generates more accurate workflows from the start
- Less need for corrections and adjustments

---

## 🗂️ What's in This Folder?

This folder contains everything you need to understand and use fine-tuning:

1. **README.md** (this file) - Overview and introduction
2. **WHAT_CHANGED.md** - Detailed list of all code changes
3. **STEP_BY_STEP_GUIDE.md** - What YOU need to do (simple steps)
4. **SCRIPTS_EXPLAINED.md** - What each script does
5. **CONFIGURATION_GUIDE.md** - How to configure everything
6. **TROUBLESHOOTING.md** - Common problems and solutions

---

## 🚀 Quick Start (3 Steps)

If you just want to get started quickly:

1. **Prepare your training data**
   ```bash
   npm run train:prepare-data
   ```

2. **Train the model**
   ```bash
   npm run train:ollama-ft
   ```
   
   **Note:** The script will automatically use the Modelfile method (which works without any additional packages). If you see a message about `ollama-ft` not being installed, that's fine - the script will fall back to the working Modelfile method automatically.

3. **Enable it**
   - Edit `worker/env`
   - Set `USE_FINE_TUNED_MODEL=true`
   - Restart: `npm run dev`

**That's it!** For detailed explanations, read the other files in this folder.

**Note:** The Modelfile method customizes model behavior and parameters. For actual weight training (advanced fine-tuning), see the advanced guides in this folder.

**⚠️ Using a Remote Ollama Endpoint?**
If you're using a remote Ollama proxy (like `ollama.ctrlchecks.ai`), model creation must be done on the server where Ollama is running. The script will create a Modelfile for you - you'll need to run `ollama create` on the server, or use a local Ollama instance for training.

---

## 📚 Next Steps

1. **New to fine-tuning?** → Read `STEP_BY_STEP_GUIDE.md`
2. **Want to know what changed?** → Read `WHAT_CHANGED.md`
3. **Need to configure?** → Read `CONFIGURATION_GUIDE.md`
4. **Having problems?** → Read `TROUBLESHOOTING.md`

---

## ❓ Common Questions

### Do I need to fine-tune?
- **No, it's optional.** Your system works without it.
- **Yes, if you want** better accuracy and faster responses.

### Will it break my current setup?
- **No.** Fine-tuning is optional. You can enable/disable it anytime.

### How long does it take?
- **Training:** 30-60 minutes (one time)
- **Setup:** 5-10 minutes

### Do I need special hardware?
- **No.** It works on your current setup.

---

**Ready to start?** Open `STEP_BY_STEP_GUIDE.md` next! 🚀
