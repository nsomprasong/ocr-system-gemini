import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore"
import { db } from "../src/firebase"
import type { Template } from "./template.schema"

/**
 * Loads all templates for a specific user.
 * Queries subcollection: users/{userId}/templates
 * 
 * @param userId - User ID to load templates for
 * @returns Promise that resolves to array of templates
 */
export async function loadTemplates(userId: string): Promise<Template[]> {
  if (!userId) {
    throw new Error("userId is required")
  }

  // Query subcollection: users/{userId}/templates
  const templatesRef = collection(db, "users", userId, "templates")
  const snapshot = await getDocs(templatesRef)

  const templates: Template[] = []
  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    templates.push({
      templateId: docSnap.id,
      userId: data.userId || userId,
      templateName: data.templateName || "",
      columns: data.columns || [],
      rotation: data.rotation || 0, // Load rotation from template (default: 0)
    } as Template)
  })

  console.log(`✅ Loaded ${templates.length} templates for user ${userId}`)
  return templates
}

/**
 * Loads a single template by ID for a specific user.
 * 
 * @param userId - User ID
 * @param templateId - Template ID to load
 * @returns Promise that resolves to template or null if not found
 */
export async function loadTemplate(userId: string, templateId: string): Promise<Template | null> {
  if (!userId) {
    throw new Error("userId is required")
  }
  if (!templateId) {
    throw new Error("templateId is required")
  }

  // Load from subcollection: users/{userId}/templates/{templateId}
  const templateRef = doc(db, "users", userId, "templates", templateId)
  const snapshot = await getDoc(templateRef)

  if (!snapshot.exists()) {
    console.log(`ℹ️ Template not found: ${templateId} for user ${userId}`)
    return null
  }

  const data = snapshot.data()
  // IMPORTANT: Check if rotation exists in data (even if it's 0)
  // Use nullish coalescing to only default to 0 if rotation is undefined/null
  const rotation = data.rotation !== undefined && data.rotation !== null ? data.rotation : 0
  const template: Template = {
    templateId: snapshot.id,
    userId: data.userId || userId,
    templateName: data.templateName || "",
    columns: data.columns || [],
    rotation: rotation, // Load rotation from template (default: 0)
  }

  console.log(`✅ Loaded template: ${templateId} for user ${userId}, rotation: ${rotation}° (from data: ${data.rotation})`)
  return template
}
