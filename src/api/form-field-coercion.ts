/** Form field config shape from workflow form node (builder). */
export type FormFieldConfig = {
  name?: string;
  type?: string;
  label?: string;
  required?: boolean;
  min?: number;
  max?: number;
  [key: string]: unknown;
};

/**
 * After validation, coerce HTTP string payloads to native types using each field's `type`.
 * Universal: driven only by `fields[]` metadata, no per-workflow or per-field-name logic.
 */
export function coerceFormFields(
  formData: Record<string, unknown>,
  fields: FormFieldConfig[]
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...formData };

  for (const field of fields) {
    const name = field.name || "";
    if (!name) continue;

    const raw = out[name];
    const type = field.type || "text";

    switch (type) {
      case "number": {
        if (raw === undefined || raw === null || raw === "") continue;
        const num = Number(raw);
        if (!Number.isNaN(num)) out[name] = num;
        break;
      }
      case "checkbox": {
        if (raw === undefined || raw === null || raw === "") {
          out[name] = false;
        } else if (typeof raw === "boolean") {
          out[name] = raw;
        } else {
          const s = String(raw).toLowerCase().trim();
          out[name] = s === "true" || s === "on" || s === "1" || s === "yes";
        }
        break;
      }
      case "date": {
        if (raw === undefined || raw === null || raw === "") continue;
        const s = String(raw).trim();
        if (!s) continue;
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) {
          out[name] = d.toISOString();
        }
        break;
      }
      case "file":
        break;
      default:
        break;
    }
  }

  return out;
}
