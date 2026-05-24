# Security Specification: Bynex Trader Firestore

## 1. Data Invariants
1.  **Identity Integrity**: Users can only read/write their own subcollections (accounts, trades).
2.  **Relational Sync**: A trade can ONLY be created if the `userId` matches the authenticated `request.auth.uid`.
3.  **State Immutability**: Once a trade status is marked as 'won', 'lost', or 'sold', it CANNOT be modified.

## 2. The "Dirty Dozen" Payloads (Adversarial Audit)
1.  **Spoof UID**: Create user document with `uid` that is NOT `request.auth.uid`.
2.  **Orphaned Trade**: Create a `Trade` document in a user's collection where the `userId` does not match the parent collection path.
3.  **Ghost Field**: Update a `Trade` status including a new field `isAdmin: true`.
4.  **Terminal State Override**: Update a trade with `status: 'won'` to `status: 'open'`.
5.  **Invalid Type Poisoning**: Update `buyPrice` with a string instead of a number.
6.  **ID Exhaustion**: Use a 2KB string as a `{tradeId}`.
7.  **Relational Scraping**: Authenticated user 'A' attempts to `list` documents in user 'B'’s `trades` collection.
8.  **Balance Theft**: User attempts to update `Account.balance` field directly.
9.  **Date Spoofing**: Attempt to set `createdAt` to 10 years in the future.
10. **Email Manipulation**: Attempt to save user profile with an `email` that is not verified.
11. **Negative Price**: Attempt to set `buyPrice` to a negative number.
12. **Missing Required Fields**: Attempt to create a `Trade` missing the `symbol`.

## 3. The Rules Audit Plan
*   Run the "Shadow Update" test on all collections.
*   Verify PII isolation for `User` documents.
*   Enforce `.size()` constraints on all inputs.
