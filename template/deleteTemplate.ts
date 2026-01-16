import { doc, deleteDoc } from "firebase/firestore"
import { db } from "../src/firebase"

/**
 * Deletes a template from Firestore.
 * Uses subcollection: users/{userId}/templates/{templateId}
 * 
 * @param userId - User ID
 * @param templateId - Template ID to delete
 * @returns Promise that resolves when template is deleted
 */
export async function deleteTemplate(userId: string, templateId: string): Promise<void> {
  if (!userId) {
    throw new Error("userId is required")
  }
  if (!templateId) {
    throw new Error("templateId is required")
  }

  // Delete from subcollection: users/{userId}/templates/{templateId}
  const templateRef = doc(db, "users", userId, "templates", templateId)
  await deleteDoc(templateRef)
  console.log(`✅ Template deleted: ${templateId} for user ${userId}`)
}
