# PCH PMS Security Specification

## 1. Data Invariants
1. Every document is protected by a default-deny catch-all at `/databases/{database}/documents/{document=**}`.
2. Only verified authenticated users (`request.auth != null && request.auth.token.email_verified == true`) can access authorized documents.
3. Bootstrapped PCH Super Admin (`purecresthospitality@gmail.com` with `email_verified == true`) has global multi-property and centralized license authority.
4. All subcollections under `/properties/{propertyId}/...` validate existence and membership of the parent `/properties/{propertyId}` document on single-doc operations (`get`, `create`, `update`, `delete`).
5. All `allow list` rules evaluate solely `request.auth` and `resource.data` (`ownerUid` or bounded `authorizedEmails` list) with zero `get()` or `exists()` calls.
6. Every `create` rule enforces exact `keys().hasAll(...)` and `keys().hasOnly(...)`, `createdAt == request.time`, and `ownerUid == request.auth.uid`.
7. Every `update` rule invokes `isValid[Entity](incoming())`, verifies `updatedAt == request.time`, preserves immutable `createdAt`, `ownerUid`, and `propertyId`, and restricts mutable keys via `affectedKeys().hasOnly(...)`.
8. Audit logs (`/audit_logs/{logId}`) are append-only: `update` and `delete` are forbidden for all clients.
9. User role profiles (`/users/{userId}`) block self-elevation of `role` or `active` unless performed by `isBootstrappedAdmin()`.

## 2. Adversarial "Dirty Dozen" Attack Payloads (All Must Be Denied)
1. **Unauthenticated read on `/properties/richgates-enugu`**: `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified email spoofing admin**: `request.auth.token.email == 'purecresthospitality@gmail.com'`, `email_verified == false` -> `PERMISSION_DENIED`.
3. **Shadow field injection on Room create**: Adding `{ "isAdmin": true }` to room payload -> `PERMISSION_DENIED` (`hasOnly` rejection).
4. **Identity spoofing on Property create**: Setting `ownerUid` to another user's UID -> `PERMISSION_DENIED`.
5. **Client timestamp forgery**: Setting `createdAt` to a past timestamp instead of `request.time` -> `PERMISSION_DENIED`.
6. **ID poisoning**: Document ID longer than 128 chars or containing invalid characters (`/`, `$`) -> `PERMISSION_DENIED` (`isValidId`).
7. **Terminal state bypass on Reservation**: Updating a `checked_out` or `cancelled` reservation as non-admin staff -> `PERMISSION_DENIED`.
8. **Cross-property orphan write**: Creating a room under `/properties/nonexistent-prop/rooms/r1` -> `PERMISSION_DENIED` (Master Gate `exists()` fails).
9. **Unauthorized staff list scraping**: Signed-in user whose email is NOT in `authorizedEmails` querying `/properties/richgates-enugu/guests` -> `PERMISSION_DENIED`.
10. **Self-promotion in `/users/{uid}`**: Non-admin user updating their `role` from `front_desk` to `pch_admin` -> `PERMISSION_DENIED`.
11. **Audit log tampering**: Attempting to `update` or `delete` any doc in `/audit_logs/{logId}` -> `PERMISSION_DENIED`.
12. **License key forgery**: Non-admin property staff attempting to create or extend a Lifetime license in `/licenses/{licenseId}` -> `PERMISSION_DENIED`.
