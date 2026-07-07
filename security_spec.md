# Security Specification - Sofian AI

## Data Invariants
1. A **Session** must have a `userId` that matches the authenticated user.
2. A **Message** must belong to a session that belongs to the user, and its `userId` must match.
3. Every document MUST have `userId`, `createdAt`, and `updatedAt`.
4. Users cannot modify `createdAt` after creation.
5. Users cannot change the `role` or `isAdmin` fields unless they are already an admin.
6. Guest users (anonymous) have the same rights as registered users for their own data, but cannot be admins.

## The "Dirty Dozen" Payload Attacks

### 1. The ID Poisoning Attack
Payload: `{ "id": "A".repeat(2000), "title": "Junk", ... }`
Expected: `PERMISSION_DENIED` (ID size > 128)

### 2. The Identity Spoofing Attack
Try to create a session with `userId: "OTHER_USER_ID"`.
Expected: `PERMISSION_DENIED` (UID mismatch)

### 3. The Shadow Field Update
Try to update a session adding `{ "isAdmin": true }`.
Expected: `PERMISSION_DENIED` (Strict affectedKeys check)

### 4. The State Shortcutting (Immutability)
Try to update `createdAt` timestamp.
Expected: `PERMISSION_DENIED` (isUnchanged check)

### 5. The Orphaned Message Attack
Try to create a message for a `sessionId` that doesn't exist.
Expected: `PERMISSION_DENIED` (exists() check)

### 6. The Denial of Wallet (Size Attack)
Try to send a message with `content` of 2MB (Firestore limit is 1MB anyway, but rules should catch it if possible, though rules have a max part size too).
Expected: `PERMISSION_DENIED` (String size limit)

### 7. The Session Hijacking Attack
Authenticated User B tries to read User A's session.
Expected: `PERMISSION_DENIED` (isOwner check)

### 8. The System Field Tampering
Try to update `updatedAt` to a past date instead of `request.time`.
Expected: `PERMISSION_DENIED` (Temporal integrity check)

### 9. The Anonymous Admin Escalation
An anonymous user tries to set `role: "admin"` on their profile.
Expected: `PERMISSION_DENIED` (Role change restricted)

### 10. The PII Leak Attack
Unauthorized user tries to list all `users` collection.
Expected: `PERMISSION_DENIED` (List check)

### 11. The Update-Gap Attack
Try to update a session and change the `userId`.
Expected: `PERMISSION_DENIED` (uidUnchanged check)

### 12. The Malicious Reference Attack
Create a MindMode pointing to a `userId` that isn't the current user.
Expected: `PERMISSION_DENIED` (UID mismatch)
