import { doc, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "../src/firebase"
import type { Template } from "./template.schema"

/**
 * Saves a template to Firestore.
 * Uses subcollection: users/{userId}/templates/{templateId}
 * 
 * @param template - Template object to save
 * @returns Promise that resolves when template is saved
 */
export async function saveTemplate(template: Template): Promise<void> {
  if (!template.userId) {
    throw new Error("Template userId is required")
  }
  if (!template.templateId) {
    throw new Error("Template templateId is required")
  }

  // Use subcollection: users/{userId}/templates/{templateId}
  // This ensures templates are scoped per user and doesn't modify existing collections
  const templateRef = doc(db, "users", template.userId, "templates", template.templateId)

  // Helper function to remove undefined values (Firestore doesn't support undefined)
  const removeUndefined = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return null
    }
    if (Array.isArray(obj)) {
      return obj.map(removeUndefined)
    }
    if (typeof obj === 'object') {
      const cleaned: any = {}
      for (const key in obj) {
        if (obj[key] !== undefined) {
          cleaned[key] = removeUndefined(obj[key])
        }
      }
      return cleaned
    }
    return obj
  }

  const templateData = removeUndefined({
    ...template,
    updatedAt: serverTimestamp(),
    createdAt: template.createdAt || serverTimestamp(),
  })

  await setDoc(templateRef, templateData, { merge: false })
  console.log(`✅ Template saved: ${template.templateId} for user ${template.userId}`)
}
