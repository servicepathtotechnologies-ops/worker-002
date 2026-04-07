export type FieldOwnershipGuidanceSections = {
  whatThisFieldDoes: string;
  ifYouChooseYou: string;
  ifYouChooseAIBuild: string;
  ifYouChooseAIRuntime: string;
  isActuallyRequired: string;
  whereToGetValue: string;
  nextStepExpectations: string;
};

export function buildFieldOwnershipGuidancePrompt(args: {
  question: string;
  context: unknown;
}): string {
  return [
    "You are a Field Ownership guidance assistant for workflow setup.",
    "Explain clearly and helpfully without forcing a decision.",
    "Do not mutate workflows; analysis only.",
    "Use only provided context; avoid inventing facts.",
    "If runtime/build AI is unsupported, explain fallback behavior.",
    "Return STRICT JSON object with keys:",
    "whatThisFieldDoes, ifYouChooseYou, ifYouChooseAIBuild, ifYouChooseAIRuntime, isActuallyRequired, whereToGetValue, nextStepExpectations.",
    "",
    "User question:",
    args.question,
    "",
    "Context JSON:",
    JSON.stringify(args.context || {}, null, 2),
  ].join("\n");
}

export function fallbackFieldOwnershipGuidance(): FieldOwnershipGuidanceSections {
  return {
    whatThisFieldDoes:
      "This field affects how your node is configured during workflow setup or execution.",
    ifYouChooseYou:
      "You provide the value manually. If required and empty, you will be asked in the next setup step.",
    ifYouChooseAIBuild:
      "AI generates the value once during build/setup and reuses it unless you change it later.",
    ifYouChooseAIRuntime:
      "AI generates the value when the workflow runs. This option only works for fields that support runtime AI.",
    isActuallyRequired:
      "Required fields must be resolved before execution. Optional fields can be skipped.",
    whereToGetValue:
      "For credentials, get values from the provider account/app console (API keys, OAuth app, webhook settings).",
    nextStepExpectations:
      "After Field Ownership, the Credentials step asks for missing secrets/connections and manual required values.",
  };
}
